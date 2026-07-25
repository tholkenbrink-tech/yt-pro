import Foundation
import Capacitor
import AVFoundation
import AVKit
import MediaPlayer
import WebKit

private extension CGRect {
    /// A frame is only usable to position the player if it has positive,
    /// finite width/height - a NaN/zero/negative rect (e.g. the HTML
    /// placeholder measured before its layout settled) would otherwise
    /// silently place an invisible player on screen with no visible error.
    var isUsablePlayerFrame: Bool {
        width > 0 && height > 0
            && width.isFinite && height.isFinite
            && origin.x.isFinite && origin.y.isFinite
    }
}

/// AVKit auto-expands an embedded/inline AVPlayerViewController to its own
/// full-screen presentation when the interface is (or rotates to) landscape
/// while it's on screen and playing - documented, if under-specified,
/// behavior with no dedicated public flag to disable. Overriding
/// `shouldAutorotate` on the player's own view controller is the accepted
/// public-API way to opt this specific instance out of it, so landscape
/// playback stays in the embedded layout the web side builds for it, and
/// fullscreen only ever happens when the user explicitly taps AVKit's own
/// expand control (still fully supported - that transition doesn't depend
/// on this controller's rotation policy).
private final class EmbeddedPlayerViewController: AVPlayerViewController {
    override var shouldAutorotate: Bool { false }
}

/// Bridges video playback to a native AVPlayerViewController instead of the
/// web <video> element, only inside the iOS app shell. This is what gets us
/// *real* Picture-in-Picture and reliable background audio on iOS - both are
/// hard platform restrictions on web content (see PictureInPictureButton.tsx
/// and the shadow-audio workaround in VideoPlayer.tsx for what that's like
/// from the web side) but are standard, built-in behavior for a native
/// AVPlayerViewController: `allowsPictureInPicturePlayback` gives a real PiP
/// button and PiP-on-backgrounding, and the `.playback` AVAudioSession
/// category (configured in AppDelegate) plus `UIBackgroundModes: audio` in
/// Info.plist is all it takes for the audio track to survive backgrounding.
///
/// The player is embedded as a child view controller pinned near the top of
/// the screen rather than presented modally full-screen - that's what gives
/// it AVKit's own inline "expand to fullscreen" control instead of forcing
/// fullscreen the instant playback starts. Fullscreen is then just a native
/// UI choice the user makes from the player's own controls, matched by
/// `EmbeddedPlayerViewController` opting out of AVKit's automatic
/// landscape-triggered fullscreen above. Getting the rest of that "user
/// stays in control of fullscreen/PiP, and nothing gets stuck" property
/// right is what the `AVPlayerViewControllerDelegate` methods and the
/// teardown-gating below (see "MARK: - Teardown gating") exist for - a
/// child-embedded player has no presenting view controller for AVKit to
/// coordinate transitions through the way it would for a modally-presented
/// one, so this plugin has to do that coordination itself.
///
/// The web side stays the source of truth for everything else (resume
/// position, offline files, mark-watched-at-95%, settings) - this plugin
/// just presents the native player surface and reports position/playback
/// state back via periodic "timeUpdate" events, so the existing
/// api.saveProgress()/api.markWatched() calls keep working unchanged from
/// the JS side. Dismissal is always explicit (JS calls dismiss()) since an
/// inline-embedded player has no "Done" button of its own.
@objc(NativePlayerPlugin)
public class NativePlayerPlugin: CAPPlugin, CAPBridgedPlugin, AVPlayerViewControllerDelegate {
    public let identifier = "NativePlayerPlugin"
    public let jsName = "NativePlayer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "present", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dismiss", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBackgroundMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateFrame", returnType: CAPPluginReturnPromise)
    ]

    private var player: AVPlayer?
    private var playerViewController: AVPlayerViewController?
    private var timeObserverToken: Any?
    private var statusObservation: NSKeyValueObservation?
    private var webViewLoadingObservation: NSKeyValueObservation?
    private var didResolvePresent = false

    // Tracks whether AVKit currently owns an in-flight fullscreen animation
    // or an active system Picture-in-Picture session for this player.
    // teardownPlayer() must never run while either is true - deallocating
    // the AVPlayer/removing the view out from under a transition AVKit's
    // own state machine still thinks it's driving is exactly what produced
    // the reported "stuck, must restart the app" state: an orphaned system
    // UI layer with nothing left able to coordinate its own dismissal.
    private var isFullScreenTransitioning = false
    private var isPipActive = false
    private var pendingTeardown = false

    public override func load() {
        // A page reload (e.g. Capacitor's own recovery in
        // WebViewDelegationHandler.webViewWebContentProcessDidTerminate,
        // which fires if iOS kills the WKWebView's content process - which
        // can happen during long background-audio sessions) wipes all JS
        // state instantly, with no chance for our JS-side cleanup (see
        // NativeVideoPlayer.tsx's unmount effect) to run first. Without
        // this, a leftover AVPlayerViewController would stay attached as a
        // child of the root view controller, invisible to the freshly
        // loaded page and impossible to dismiss - exactly what "app broke,
        // needed a hard refresh" looks like. `isLoading` only toggles for a
        // real native navigation/reload, never for the SPA's own client-
        // side route changes, so this doesn't interfere with normal in-app
        // navigation (already handled by the JS-side cleanup).
        webViewLoadingObservation = webView?.observe(\.isLoading, options: [.new]) { [weak self] _, change in
            guard change.newValue == true else { return }
            DispatchQueue.main.async {
                self?.requestTeardown()
            }
        }
    }

    @objc func present(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("Missing or invalid 'url'")
            return
        }
        let title = call.getString("title") ?? "Video"
        let artist = call.getString("artist")
        let artworkUrl = call.getString("artworkUrl")
        let startTime = call.getDouble("startTime") ?? 0
        let pip = call.getString("backgroundMode") == "pip"
        // Bounds of the HTML placeholder element the web side wants the
        // video positioned over (in CSS px, which map 1:1 to UIKit points
        // since the WKWebView isn't pinch-zoomed) - see the frame comment
        // in presentPlayer for why this matters.
        let frame = CGRect(
            x: call.getDouble("x") ?? 0,
            y: call.getDouble("y") ?? 0,
            width: call.getDouble("width") ?? 0,
            height: call.getDouble("height") ?? 0
        )

        // The stream URL is behind the same session-cookie auth as every
        // other API call (see backend/app/core/deps.py) - the web <video>
        // element gets that cookie for free because it shares the
        // WKWebView's network stack, but AVPlayer/AVURLAsset uses a
        // separate one (HTTPCookieStorage.shared) that never sees it
        // otherwise. Without this, every stream request 401s and the video
        // silently fails to load. Copying the WKWebView's cookies over
        // before creating the asset is what makes this work at all.
        WKWebsiteDataStore.default().httpCookieStore.getAllCookies { [weak self] cookies in
            guard let self = self else { return }
            for cookie in cookies {
                HTTPCookieStorage.shared.setCookie(cookie)
            }
            self.presentPlayer(
                url: url,
                title: title,
                artist: artist,
                artworkUrl: artworkUrl,
                startTime: startTime,
                pip: pip,
                frame: frame,
                call: call
            )
        }
    }

    private func presentPlayer(
        url: URL,
        title: String,
        artist: String?,
        artworkUrl: String?,
        startTime: Double,
        pip: Bool,
        frame: CGRect,
        call: CAPPluginCall
    ) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            guard let rootVC = self.bridge?.viewController else {
                call.reject("No root view controller to present from")
                return
            }

            // Deliberately unconditional (not requestTeardown()) - a new
            // present() call means the caller wants to replace whatever's
            // currently showing outright, e.g. picking a different video
            // from the mini-bar. Switching away from an in-progress
            // fullscreen/PiP transition mid-flight is an edge case this
            // doesn't try to smooth over.
            self.teardownPlayer()
            self.didResolvePresent = false

            let item = AVPlayerItem(url: url)
            let player = AVPlayer(playerItem: item)
            self.player = player

            // Surfaces real load failures (e.g. still-bad auth, a deleted
            // file, an unsupported codec) as a "playbackError" event instead
            // of the player just sitting there silently - present() itself
            // has already resolved by the time this can fire, since asset
            // loading happens asynchronously after the item is created.
            self.statusObservation = item.observe(\.status, options: [.new]) { [weak self] observedItem, _ in
                guard observedItem.status == .failed else { return }
                let message = observedItem.error?.localizedDescription ?? "Unknown playback error"
                self?.notifyListeners("playbackError", data: ["message": message])
            }

            let vc = EmbeddedPlayerViewController()
            vc.player = player
            vc.delegate = self
            vc.allowsPictureInPicturePlayback = true
            vc.canStartPictureInPictureAutomaticallyFromInline = pip
            self.playerViewController = vc

            rootVC.addChild(vc)
            rootVC.view.addSubview(vc.view)
            vc.didMove(toParent: rootVC)

            // Positioned to match the HTML placeholder's actual bounds
            // (updated live as the page scrolls/resizes/rotates via
            // updateFrame) rather than a fixed guess - a hardcoded frame
            // covered other page content in landscape/sidebar layouts and
            // could block taps on the background-mode buttons underneath.
            // If the web side ever hands us a degenerate rect (e.g. measured
            // before layout settled), falling back to `frame` verbatim would
            // silently render an invisible 0x0 player with no way for the
            // user to tell it's even there - always prefer a guaranteed-
            // visible frame over trusting the caller blindly.
            vc.view.frame = self.sanitizedFrame(frame, fallbackIn: rootVC)


            self.setNowPlayingMetadata(title: title, artist: artist, artworkUrl: artworkUrl)
            self.setupRemoteCommandCenter()
            self.observeTime()

            if startTime > 0 {
                player.seek(to: CMTime(seconds: startTime, preferredTimescale: 600))
            }

            player.play()
            if !self.didResolvePresent {
                self.didResolvePresent = true
                call.resolve()
            }
        }
    }

    @objc func dismiss(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.resolve(["positionSeconds": 0])
                return
            }
            let position = self.player?.currentTime().seconds ?? 0
            // Resolves immediately either way - JS shouldn't have to wait on
            // an in-flight AVKit transition just to know the last playback
            // position. The actual view/player cleanup may happen later,
            // once it's safe (see requestTeardown).
            self.requestTeardown()
            call.resolve(["positionSeconds": position.isFinite ? position : 0])
        }
    }

    @objc func setBackgroundMode(_ call: CAPPluginCall) {
        let pip = call.getString("mode") == "pip"
        DispatchQueue.main.async { [weak self] in
            self?.playerViewController?.canStartPictureInPictureAutomaticallyFromInline = pip
        }
        call.resolve()
    }

    @objc func updateFrame(_ call: CAPPluginCall) {
        let frame = CGRect(
            x: call.getDouble("x") ?? 0,
            y: call.getDouble("y") ?? 0,
            width: call.getDouble("width") ?? 0,
            height: call.getDouble("height") ?? 0
        )
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let vc = self.playerViewController else { return }
            // A one-off bad measurement here (mid-transition, a layout
            // still settling) shouldn't blow away a previously-good frame -
            // unlike the initial present(), there's no "fallback" that's
            // more correct than just leaving the player where it already
            // visibly is, so degenerate updates are dropped rather than
            // applied.
            guard frame.isUsablePlayerFrame else { return }
            vc.view.frame = frame
        }
        call.resolve()
    }

    /// Guards against a zero/negative/non-finite frame from the web side
    /// (e.g. the placeholder measured before its layout had settled)
    /// silently producing an invisible 0x0 player - the exact failure mode
    /// that motivated this fallback: JS believes the player is presented
    /// (button already flipped to its "playing" state) while nothing is
    /// actually on screen, with no error surfaced anywhere. Mirrors the
    /// frame this plugin used before per-placeholder positioning existed:
    /// full width, 16:9, pinned under the safe area.
    private func sanitizedFrame(_ frame: CGRect, fallbackIn rootVC: UIViewController) -> CGRect {
        guard frame.isUsablePlayerFrame else {
            let safeArea = rootVC.view.safeAreaInsets
            let width = rootVC.view.bounds.width
            let height = width * 9 / 16
            return CGRect(x: 0, y: safeArea.top, width: width, height: height)
        }
        return frame
    }

    // MARK: - AVPlayerViewControllerDelegate

    // AVKit moves the player's view into its own full-screen container for
    // the duration of this transition and back afterwards - teardownPlayer()
    // removing that same view mid-flight (e.g. from a dismiss() the JS side
    // fired right as the user tapped fullscreen) is exactly what stranded
    // AVKit's transition with no view left to animate, producing the
    // reported "stuck between states" / invisible-blocking-overlay bug.
    public func playerViewController(
        _ playerViewController: AVPlayerViewController,
        willBeginFullScreenPresentationWithAnimationCoordinator coordinator: UIViewControllerTransitionCoordinator
    ) {
        isFullScreenTransitioning = true
        coordinator.animate(alongsideTransition: nil) { [weak self] _ in
            self?.isFullScreenTransitioning = false
            self?.notifyListeners("fullscreenChange", data: ["isFullscreen": true])
            self?.runPendingTeardownIfNeeded()
        }
    }

    public func playerViewController(
        _ playerViewController: AVPlayerViewController,
        willEndFullScreenPresentationWithAnimationCoordinator coordinator: UIViewControllerTransitionCoordinator
    ) {
        isFullScreenTransitioning = true
        coordinator.animate(alongsideTransition: nil) { [weak self] _ in
            self?.isFullScreenTransitioning = false
            self?.notifyListeners("fullscreenChange", data: ["isFullscreen": false])
            self?.runPendingTeardownIfNeeded()
        }
    }

    public func playerViewControllerWillStartPictureInPicture(_ playerViewController: AVPlayerViewController) {
        isPipActive = true
        notifyListeners("pipChange", data: ["isActive": true])
    }

    public func playerViewControllerDidStopPictureInPicture(_ playerViewController: AVPlayerViewController) {
        isPipActive = false
        notifyListeners("pipChange", data: ["isActive": false])
        runPendingTeardownIfNeeded()
    }

    public func playerViewController(
        _ playerViewController: AVPlayerViewController,
        failedToStartPictureInPictureWithError error: Error
    ) {
        isPipActive = false
        notifyListeners("pipChange", data: ["isActive": false, "error": error.localizedDescription])
    }

    // Our player is embedded as a child view controller, never presented
    // modally - there's nothing for AVKit to dismiss when PiP starts, and
    // letting it try (the default `true`) risks interacting badly with a
    // view hierarchy AVKit doesn't actually own the presentation of.
    public func playerViewControllerShouldAutomaticallyDismissAtPictureInPictureStart(
        _ playerViewController: AVPlayerViewController
    ) -> Bool {
        return false
    }

    // Fires when the user taps "restore" from the system PiP overlay (or on
    // auto-restore). The player's view is already sitting exactly where we
    // left it in our own view hierarchy - the only thing that might not be
    // showing is whichever web page owns that placeholder right now, so we
    // just tell JS a restore happened (it navigates back to the video page
    // if needed - see nativePlayerStore's pipRestoreRequested handling) and
    // tell AVKit the UI is ready. A fixed short delay rather than waiting on
    // a JS round-trip so a web-side error can never wedge AVKit's own
    // completion handler open indefinitely.
    public func playerViewController(
        _ playerViewController: AVPlayerViewController,
        restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void
    ) {
        notifyListeners("pipRestoreRequested", data: [:])
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            completionHandler(true)
        }
    }

    // MARK: - Teardown gating

    /// The only path that should ever remove the player's view/deallocate
    /// its AVPlayer. Safe to call any time - defers itself automatically
    /// while AVKit owns an in-flight fullscreen transition or an active PiP
    /// session, and re-runs once `runPendingTeardownIfNeeded()` sees that
    /// clear.
    private func requestTeardown() {
        guard !isFullScreenTransitioning, !isPipActive else {
            pendingTeardown = true
            // Stops playback (and any background audio) right away even
            // though the view/player themselves have to stay alive until
            // AVKit's own transition or PiP session actually finishes.
            player?.pause()
            return
        }
        pendingTeardown = false
        teardownPlayer()
    }

    private func runPendingTeardownIfNeeded() {
        guard pendingTeardown, !isFullScreenTransitioning, !isPipActive else { return }
        pendingTeardown = false
        teardownPlayer()
    }

    // MARK: - Time reporting

    private func observeTime() {
        guard let player = player else { return }
        let interval = CMTime(seconds: 5, preferredTimescale: 600)
        timeObserverToken = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            guard let self = self, let currentItem = self.player?.currentItem else { return }
            let duration = currentItem.duration.seconds
            self.notifyListeners("timeUpdate", data: [
                "positionSeconds": time.seconds.isFinite ? time.seconds : 0,
                "durationSeconds": duration.isFinite ? duration : 0,
                "isPlaying": self.player?.rate != 0
            ])
            self.updateNowPlayingElapsedTime()
        }
    }

    // MARK: - Now Playing / lock screen controls

    private func setNowPlayingMetadata(title: String, artist: String?, artworkUrl: String?) {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: title
        ]
        if let artist = artist, !artist.isEmpty {
            info[MPMediaItemPropertyArtist] = artist
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info

        guard let artworkUrl = artworkUrl, let url = URL(string: artworkUrl) else { return }
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self = self, let data = data, let image = UIImage(data: data) else { return }
            let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            DispatchQueue.main.async {
                var current = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
                current[MPMediaItemPropertyArtwork] = artwork
                MPNowPlayingInfoCenter.default().nowPlayingInfo = current
            }
        }.resume()
    }

    private func updateNowPlayingElapsedTime() {
        guard let player = player, let currentItem = player.currentItem else { return }
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = player.currentTime().seconds
        if currentItem.duration.seconds.isFinite {
            info[MPMediaItemPropertyPlaybackDuration] = currentItem.duration.seconds
        }
        info[MPNowPlayingInfoPropertyPlaybackRate] = player.rate
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func setupRemoteCommandCenter() {
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.removeTarget(nil)
        center.pauseCommand.removeTarget(nil)
        center.skipForwardCommand.removeTarget(nil)
        center.skipBackwardCommand.removeTarget(nil)
        center.changePlaybackPositionCommand.removeTarget(nil)

        center.playCommand.addTarget { [weak self] _ in
            self?.player?.play()
            return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            self?.player?.pause()
            return .success
        }
        center.skipForwardCommand.preferredIntervals = [10]
        center.skipForwardCommand.addTarget { [weak self] event in
            guard let self = self, let player = self.player else { return .commandFailed }
            let seconds = (event as? MPSkipIntervalCommandEvent)?.interval ?? 10
            let target = player.currentTime() + CMTime(seconds: seconds, preferredTimescale: 600)
            player.seek(to: target)
            return .success
        }
        center.skipBackwardCommand.preferredIntervals = [10]
        center.skipBackwardCommand.addTarget { [weak self] event in
            guard let self = self, let player = self.player else { return .commandFailed }
            let seconds = (event as? MPSkipIntervalCommandEvent)?.interval ?? 10
            let target = CMTimeSubtract(player.currentTime(), CMTime(seconds: seconds, preferredTimescale: 600))
            player.seek(to: target)
            return .success
        }
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let self = self, let player = self.player,
                  let positionEvent = event as? MPChangePlaybackPositionCommandEvent else {
                return .commandFailed
            }
            player.seek(to: CMTime(seconds: positionEvent.positionTime, preferredTimescale: 600))
            return .success
        }
    }

    private func teardownPlayer() {
        if let token = timeObserverToken {
            player?.removeTimeObserver(token)
            timeObserverToken = nil
        }
        statusObservation?.invalidate()
        statusObservation = nil
        player?.pause()
        player = nil
        if let vc = playerViewController {
            vc.willMove(toParent: nil)
            vc.view.removeFromSuperview()
            vc.removeFromParent()
        }
        playerViewController = nil
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        isFullScreenTransitioning = false
        isPipActive = false
        pendingTeardown = false
    }
}
