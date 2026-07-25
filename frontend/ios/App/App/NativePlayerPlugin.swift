import Foundation
import Capacitor
import AVFoundation
import AVKit
import MediaPlayer
import WebKit

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
/// UI choice the user makes from the player's own controls; we don't have to
/// do anything extra for it to work.
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
        CAPPluginMethod(name: "setBackgroundMode", returnType: CAPPluginReturnPromise)
    ]

    private var player: AVPlayer?
    private var playerViewController: AVPlayerViewController?
    private var timeObserverToken: Any?
    private var statusObservation: NSKeyValueObservation?
    private var didResolvePresent = false

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
        call: CAPPluginCall
    ) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            guard let rootVC = self.bridge?.viewController else {
                call.reject("No root view controller to present from")
                return
            }

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

            let vc = AVPlayerViewController()
            vc.player = player
            vc.delegate = self
            vc.allowsPictureInPicturePlayback = true
            vc.canStartPictureInPictureAutomaticallyFromInline = pip
            self.playerViewController = vc

            rootVC.addChild(vc)
            rootVC.view.addSubview(vc.view)
            vc.didMove(toParent: rootVC)

            let safeArea = rootVC.view.safeAreaInsets
            let width = rootVC.view.bounds.width
            let height = width * 9 / 16
            vc.view.frame = CGRect(x: 0, y: safeArea.top, width: width, height: height)
            vc.view.autoresizingMask = [.flexibleWidth, .flexibleBottomMargin]

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
            self.teardownPlayer()
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
    }
}
