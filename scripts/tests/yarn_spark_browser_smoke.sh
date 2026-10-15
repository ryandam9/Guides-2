#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
CHROME=""
for cmd in google-chrome google-chrome-stable chromium chromium-browser; do
  if command -v "$cmd" >/dev/null 2>&1; then CHROME="$(command -v "$cmd")"; break; fi
done
if [[ -z "$CHROME" ]]; then
  echo "::warning::Browser smoke check skipped (Chrome/Chromium not available)"
  exit 0
fi
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
python3 - "$dir/lab.html" <<'PY'
from pathlib import Path
import sys
source=Path("scripts/yarn_spark_cluster_lab.html").read_text()
script=r"""
<script>
(function(){
 try {
  const controls=document.querySelectorAll('#controls input,#controls select').length;
  const initial=document.querySelectorAll('#workloadRows tr').length;
  const before=document.querySelectorAll('.node').length;
  document.querySelector('#scenario').value='preempt';
  document.querySelector('#scenario').dispatchEvent(new Event('change',{bubbles:true}));
  document.querySelector('#tickSlider').value='5';
  document.querySelector('#tickSlider').dispatchEvent(new Event('input',{bubbles:true}));
  const preempt=document.querySelector('#tickEvents').textContent.includes('Preemption policy preview');
  document.querySelector('#addApp').click();
  const editor=document.querySelectorAll('#workloadRows tr').length===4;
  const nodes=document.querySelectorAll('.node').length===before;
  const mobile=window.innerWidth<830;
  const layout=getComputedStyle(document.querySelector('.shell')).display;
  const layoutOK=mobile?layout==='block':layout==='grid';
  const noOverflow=document.documentElement.scrollWidth<=window.innerWidth+3;
  const ok=controls>30 && initial===4 && before===4 && preempt && editor && nodes && layoutOK && noOverflow;
  document.body.setAttribute('data-browser-smoke',ok?'PASS':'FAIL');
  const details=document.createElement('div');details.id='browser-smoke-details';
  details.textContent=JSON.stringify({ok,controls,initial,before,preempt,editor,nodes,layoutOK,noOverflow,innerWidth:window.innerWidth,scrollWidth:document.documentElement.scrollWidth});
  document.body.appendChild(details);
 } catch(e) {
  document.body.setAttribute('data-browser-smoke','ERROR');
  const details=document.createElement('div');details.id='browser-smoke-details';details.textContent=String(e.stack||e);
  document.body.appendChild(details);
 }
})();
</script>
"""
Path(sys.argv[1]).write_text(source.replace("</body>",script+"\n</body>"))
PY
for size in "1440,900" "430,860"; do
  "$CHROME" --headless --no-sandbox --disable-gpu --disable-dev-shm-usage --disable-extensions \
     --hide-scrollbars --virtual-time-budget=3000 --window-size="$size" --dump-dom \
     "file://$dir/lab.html" > "$dir/dump.html" 2>"$dir/stderr.txt" || {
       cat "$dir/stderr.txt" >&2
       echo "Browser failed at viewport $size" >&2
       exit 1
     }
  if ! grep -q 'data-browser-smoke="PASS"' "$dir/dump.html"; then
    echo "Browser test failed at viewport $size:" >&2
    grep -o '<div id="browser-smoke-details">[^<]*' "$dir/dump.html" >&2 || true
    exit 1
  fi
  echo "PASS: viewport $size, interactive controls, timeline, editor and responsive layout"
done
