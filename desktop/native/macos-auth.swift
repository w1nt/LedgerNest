import Foundation
import LocalAuthentication
// Owner authentication permits the macOS login password when Touch ID is unavailable.
let arguments = CommandLine.arguments
let context = LAContext()
context.touchIDAuthenticationAllowableReuseDuration = 0
func output(_ result: String) {
    let value = ["result": result]
    if let data = try? JSONSerialization.data(withJSONObject: value), let text = String(data: data, encoding: .utf8) { print(text) }
}
var error: NSError?
if arguments.count == 2 && arguments[1] == "status" {
    output(context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) ? "available" : "unavailable")
    exit(0)
}
guard arguments.count == 4, arguments[1] == "verify", context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else { output("unavailable"); exit(0) }
context.localizedCancelTitle = arguments[3] == "zh-CN" ? "取消" : "Cancel"
let reason = arguments[3] == "zh-CN" ? "解锁 LedgerNest 本地数据" : "Unlock your local LedgerNest data"
context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, error in
    if success { output("verified") }
    else if let e = error as? LAError, [.userCancel, .appCancel, .systemCancel].contains(e.code) { output("canceled") }
    else { output("denied") }
    exit(0)
}
RunLoop.main.run()
