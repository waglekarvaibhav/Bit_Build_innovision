import subprocess, sys, os
res = subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "verify_browser.py")],
                     capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=280)
out = (res.stdout + "\n---STDERR---\n" + res.stderr)
with open(os.path.join(os.path.dirname(__file__), "verify_wrapper_out.txt"), "w", encoding="utf-8") as f:
    f.write(out)
print("written returncode", res.returncode)
