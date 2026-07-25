import Foundation
import Capacitor
import AVFoundation
import AVKit
import MediaPlayer

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
/// The web side stays the source of truth for everything else (resume
/// position, offline files, mark-watched-at-95%, settings) - this plugin
/// just presents the native player surface and reports position/playback
/// state back via periodic "timeUpdate" events and on dismissal, so the
/// existing api.saveProgress()/api.markWatched() calls keep working
/// unchanged from the JS side.
/// Plain AVPlayerViewController gives no hook for "the user tapped Done" -
/// only `viewDidDisappear` reliably fires for every dismissal path (Done
/// button or programmatic), so this thin subclass exists purely to surface
/// that as a closure the plugin can observe.
private class ClosableAVPlayerViewController: AVPlayerViewController {
    var onDidDisappear: (() -> Void)?

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        onDidDisappear?()
    }
}

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
    private var playerViewController: ClosableAVPlayerViewController?
    private var timeObserverToken: Any?
    private var isEnteringPictureInPicture = false
    private var isDismissingProgrammatically = false
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

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.teardownPlayer()
            self.didResolvePresent = false

            let item = AVPlayerItem(url: url)
            let player = AVPlayer(playerItem: item)
            self.player = player

            let vc = ClosableAVPlayerViewController()
            vc.player = player
            vc.delegate = self
            vc.allowsPictureInPicturePlayback = true
            vc.canStartPictureInPictureAutomaticallyFromInline = pip
            vc.modalPresentationStyle = .fullScreen
            vc.onDidDisappear = { [weak self] in
                guard let self = self else { return }
                // Also fires when PiP starts (the view controller leaves the
                // hierarchy either way) or when we dismiss it ourselves from
                // dismiss() below - neither of those is "the user closed the
                // player without going through our JS dismiss() call".
                if self.isEnteringPictureInPicture || self.isDismissingProgrammatically {
                    return
                }
                let position = self.player?.currentTime().seconds ?? 0
                self.notifyListeners("closed", data: [
                    "positionSeconds": position.isFinite ? position : 0
                ])
                self.teardownPlayer()
            }
            self.playerViewController = vc

            self.setNowPlayingMetadata(title: title, artist: artist, artworkUrl: artworkUrl)
            self.setupRemoteCommandCenter()
            self.observeTime()

            guard let rootVC = self.bridge?.viewController else {
                call.reject("No root view controller to present from")
                return
            }

            if startTime > 0 {
                player.seek(to: CMTime(seconds: startTime, preferredTimescale: 600))
            }

            rootVC.present(vc, animated: true) {
                player.play()
                if !self.didResolvePresent {
                    self.didResolvePresent = true
                    call.resolve()
                }
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
            self.isDismissingProgrammatically = true
            if let vc = self.playerViewController, vc.presentingViewController != nil {
                vc.dismiss(animated: true) {
                    call.resolve(["positionSeconds": position.isFinite ? position : 0])
                    self.teardownPlayer()
                    self.isDismissingProgrammatically = false
                }
            } else {
                call.resolve(["positionSeconds": position.isFinite ? position : 0])
                self.teardownPlayer()
                self.isDismissingProgrammatically = false
            }
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

    // MARK: - AVPlayerViewControllerDelegate

    // Suppress the "user closed the player" signal while the transition is
    // actually just entering/leaving Picture-in-Picture - the view
    // controller disappears from the main hierarchy in both cases, and
    // without this the web side would wrongly treat "entered PiP" the same
    // as "closed the player".
    public func playerViewControllerWillStartPictureInPicture(_ playerViewController: AVPlayerViewController) {
        isEnteringPictureInPicture = true
    }

    public func playerViewControllerDidStartPictureInPicture(_ playerViewController: AVPlayerViewController) {
        isEnteringPictureInPicture = false
    }

    public func playerViewController(
        _ playerViewController: AVPlayerViewController,
        failedToStartPictureInPictureWithError error: Error
    ) {
        isEnteringPictureInPicture = false
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
        player?.pause()
        player = nil
        playerViewController = nil
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }
}
