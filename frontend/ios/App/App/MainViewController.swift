import Capacitor

/// Custom-target plugins like NativePlayerPlugin (living directly in this
/// app's own target, not a separate Capacitor plugin package) aren't
/// picked up by Capacitor's automatic plugin discovery - that only scans
/// plugins declared through the generated Package.swift/Podfile. Explicitly
/// registering it here is what actually makes `NativePlayer.present()` etc.
/// resolve instead of rejecting with "UNIMPLEMENTED". Main.storyboard's
/// root view controller class is pointed at this subclass instead of the
/// stock CAPBridgeViewController.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativePlayerPlugin())
    }
}
