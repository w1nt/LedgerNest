using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Diagnostics;
using Windows.Foundation;
using Windows.Security.Credentials.UI;

// Desktop HWND interop. No credential strings are accepted or returned.
// ABI source: microsoft/win32metadata, UserConsentVerifierInterop.h (inherits IInspectable).
[ComImport, Guid("39E050C3-4E74-441A-8DC0-B81104DF949C"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IUserConsentVerifierInterop {
  // This interface inherits IInspectable: reserve its three slots before the verifier method.
  [PreserveSig] int GetIids(out uint count, out IntPtr ids);
  [PreserveSig] int GetRuntimeClassName(out IntPtr name);
  [PreserveSig] int GetTrustLevel(out int level);
  [PreserveSig] int RequestVerificationForWindowAsync(IntPtr hwnd, IntPtr message, ref Guid iid, out IntPtr operation);
}
static class DeviceAuthentication {
  [DllImport("combase.dll")] static extern int RoInitialize(uint type);
  [DllImport("combase.dll")] static extern void RoUninitialize();
  [DllImport("combase.dll",CharSet=CharSet.Unicode)] static extern int WindowsCreateString(string value,int length,out IntPtr handle);
  [DllImport("combase.dll")] static extern int WindowsDeleteString(IntPtr handle);
  [DllImport("combase.dll")] static extern int RoGetActivationFactory(IntPtr name,ref Guid iid,out IntPtr factory);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
  static string Availability(UserConsentVerifierAvailability value) {
    switch(value) {case UserConsentVerifierAvailability.Available:return "available";case UserConsentVerifierAvailability.NotConfiguredForUser:return "not_configured";case UserConsentVerifierAvailability.DisabledByPolicy:return "disabled";case UserConsentVerifierAvailability.DeviceBusy:return "busy";default:return "unavailable";}
  }
  static T Wait<T>(IAsyncOperation<T> op,int milliseconds) {
    var timer=Stopwatch.StartNew();
    while(op.Status==AsyncStatus.Started) {if(timer.ElapsedMilliseconds>milliseconds){op.Cancel();throw new TimeoutException();}Thread.Sleep(25);}
    if(op.Status!=AsyncStatus.Completed)throw new InvalidOperationException();return op.GetResults();
  }
  static void ProbeInterop() {
    IntPtr name=IntPtr.Zero,factory=IntPtr.Zero;
    try {
      string runtime="Windows.Security.Credentials.UI.UserConsentVerifier";
      Marshal.ThrowExceptionForHR(WindowsCreateString(runtime,runtime.Length,out name));
      Guid id=typeof(IUserConsentVerifierInterop).GUID;
      Marshal.ThrowExceptionForHR(RoGetActivationFactory(name,ref id,out factory));
      int trust;
      Marshal.ThrowExceptionForHR(((IUserConsentVerifierInterop)Marshal.GetObjectForIUnknown(factory)).GetTrustLevel(out trust));
      if(trust<0 || trust>2)throw new InvalidOperationException();
    } finally {if(factory!=IntPtr.Zero)Marshal.Release(factory);if(name!=IntPtr.Zero)WindowsDeleteString(name);}
  }
  static void Output(string value) {Console.WriteLine("{\"result\":\""+value+"\"}");}
  public static int Main(string[] args) {
    int init=RoInitialize(1);
    try {
      if(init<0) Marshal.ThrowExceptionForHR(init);
      if(args.Length==1 && args[0]=="status") {
        ProbeInterop();
        Output(Availability(Wait(UserConsentVerifier.CheckAvailabilityAsync(),8000)));return 0;
      }
      long raw;
      if(args.Length!=3 || args[0]!="verify" || !long.TryParse(args[1],out raw) || raw==0 || !IsWindow(new IntPtr(raw))) {Output("unavailable");return 0;}
      string reason=args[2]=="zh-CN"?"解锁 LedgerNest 本地数据":"Unlock your local LedgerNest data";
      IntPtr name=IntPtr.Zero,message=IntPtr.Zero,factory=IntPtr.Zero,operation=IntPtr.Zero;
      try {
        string runtime="Windows.Security.Credentials.UI.UserConsentVerifier";
        Marshal.ThrowExceptionForHR(WindowsCreateString(runtime,runtime.Length,out name));
        Marshal.ThrowExceptionForHR(WindowsCreateString(reason,reason.Length,out message));
        Guid interopId=typeof(IUserConsentVerifierInterop).GUID;
        Marshal.ThrowExceptionForHR(RoGetActivationFactory(name,ref interopId,out factory));
        var interop=(IUserConsentVerifierInterop)Marshal.GetObjectForIUnknown(factory);
        Guid asyncId=typeof(IAsyncOperation<UserConsentVerificationResult>).GUID;
        Marshal.ThrowExceptionForHR(interop.RequestVerificationForWindowAsync(new IntPtr(raw),message,ref asyncId,out operation));
        var pending=(IAsyncOperation<UserConsentVerificationResult>)Marshal.GetObjectForIUnknown(operation);
        var result=Wait(pending,110000);
        Output(result==UserConsentVerificationResult.Verified?"verified":result==UserConsentVerificationResult.Canceled?"canceled":"denied");return 0;
      } finally {if(operation!=IntPtr.Zero)Marshal.Release(operation);if(factory!=IntPtr.Zero)Marshal.Release(factory);if(message!=IntPtr.Zero)WindowsDeleteString(message);if(name!=IntPtr.Zero)WindowsDeleteString(name);}
    } catch {Output("unavailable");return 0;} finally {if(init>=0)RoUninitialize();}
  }
}
