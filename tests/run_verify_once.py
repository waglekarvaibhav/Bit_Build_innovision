import subprocess, sys, os
# Run the browser verification and print its output + return code in one call.
res = subprocess.run(
    [sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "verify_browser.py")],
    capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=290,
)
out = (res.stdout or "") + (("\n[STDERR]\n" + res.stderr) if res.stderr else "")
print(out)
print("[VERIFY_RETURN_CODE]", res.returncode)
