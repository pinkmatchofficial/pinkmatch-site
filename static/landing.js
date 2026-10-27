/* 핑크 랜딩 공통 스크립트. 페이지별 값은 window.PM (build.py가 넣음) */
(function () {
  const PM = window.PM;
  const $ = (id) => document.getElementById(id);
  const REQS = ["변기", "싱크대", "하수구", "세면대", "욕조", "세탁실", "기타 (직접 입력)"];
  const S = { req: "변기", addr: null, token: "", sending: false };

  function toast(m) { const t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600); }
  function err(m) { const e = $("formErr"); e.textContent = m; e.hidden = !m; }
  function kstHour() { return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "numeric", hourCycle: "h23" }).format(new Date())); }
  const isNight = () => { const h = kstHour(); return h >= 22 || h < 8; };
  async function api(path, body) {
    const r = await fetch(PM.api + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let data = {}; try { data = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(data.detail || "잠시 후 다시 시도해주세요.");
    return data;
  }
  const fmtPhone = (v) => { const d = v.replace(/\D/g, "").slice(0, 11); return d.length < 4 ? d : d.length < 8 ? d.slice(0, 3) + "-" + d.slice(3) : d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7); };

  // 심야 안내
  $("nightNotice").hidden = !isNight();

  // 문제 선택
  function renderReq() {
    const el = $("reqChips");
    el.innerHTML = REQS.map((v) => `<button type="button" class="chip" aria-pressed="${v === S.req}">${v}</button>`).join("");
    [...el.children].forEach((b) => (b.onclick = () => { S.req = b.textContent; renderReq(); }));
    $("memoWrap").hidden = !S.req.startsWith("기타");
  }
  renderReq();

  // 주소 검색 (다음 우편번호)
  function openPost() {
    if (!window.daum || !daum.Postcode) { toast("주소 검색을 불러오는 중이에요. 잠시 후 다시 눌러주세요."); return; }
    $("postLayer").hidden = false;
    new daum.Postcode({
      width: "100%", height: "100%",
      oncomplete(d) {
        S.addr = { sido: d.sido, sigungu: d.sigungu, dong: d.bname || "", addr: d.roadAddress || d.jibunAddress };
        $("fAddr").value = S.addr.addr + (d.buildingName ? ` (${d.buildingName})` : "");
        $("postLayer").hidden = true;
        $("addr2Wrap").hidden = false;
        const same = d.sido === PM.sido && (d.sigungu || "").split(" ")[0] === PM.gu;
        $("addrPick").hidden = false;
        $("addrPick").innerHTML = same ? `<span class="pill good">✓ ${PM.gu_short} 출동 가능 지역</span>` : `<span class="hint">입력하신 주소 지역의 기사님께 전달됩니다.</span>`;
        err("");
        setTimeout(() => $("fAddr2").focus(), 50);
      },
    }).embed($("postWrap"));
  }
  $("fAddr").addEventListener("click", openPost);
  $("fAddr").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPost(); } });
  $("postClose").onclick = () => ($("postLayer").hidden = true);

  // 휴대폰 인증
  $("fPhone").addEventListener("input", (e) => { e.target.value = fmtPhone(e.target.value); if (S.token) { S.token = ""; $("verified").hidden = true; } });
  let cool = 0;
  $("sendCode").onclick = async () => {
    const phone = $("fPhone").value;
    if (!/^010-\d{4}-\d{4}$/.test(phone)) { err("휴대폰 번호를 다시 확인해주세요."); return; }
    if (PM.preview) { $("codeWrap").hidden = false; toast("미리보기 화면이라 실제 문자는 발송되지 않아요"); return; }
    if (PM.closed) { toast("온라인 접수는 곧 열려요. 조금만 기다려주세요."); return; }
    if (cool > 0) return;
    try {
      $("sendCode").disabled = true;
      await api("/api/verify/send", { phone });
      $("codeWrap").hidden = false; err(""); toast("인증번호를 보냈어요"); $("fCode").focus();
      cool = 60;
      const t = setInterval(() => { cool--; $("sendCode").textContent = cool > 0 ? `재전송 ${cool}초` : "재전송"; if (cool <= 0) { clearInterval(t); $("sendCode").disabled = false; } }, 1000);
    } catch (e) { $("sendCode").disabled = false; err(e.message); }
  };
  async function checkCode() {
    const code = $("fCode").value.replace(/\D/g, "");
    if (code.length !== 6) { err("인증번호 6자리를 입력해주세요."); return; }
    if (PM.preview || PM.closed) { toast("온라인 접수는 준비 중이에요."); return; }
    try {
      const r = await api("/api/verify/check", { phone: $("fPhone").value, code });
      S.token = r.token; $("codeWrap").hidden = true; $("verified").hidden = false; err("");
    } catch (e) { err(e.message); }
  }
  $("checkCode").onclick = checkCode;
  $("fCode").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, ""); if (e.target.value.length === 6) checkCode(); });

  // 접수
  $("leadForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (S.sending) return;
    if (!S.addr) { err("주소를 검색해서 선택해주세요."); return; }
    if (S.req.startsWith("기타") && !$("fMemo").value.trim()) { err("어떤 문제인지 적어주세요."); return; }
    if (!$("fName").value.trim()) { err("이름을 입력해주세요."); return; }
    if (!$("fAgree").checked) { err("개인정보 수집·이용 및 제공에 동의해주세요."); return; }
    if (PM.preview) { err(""); toast("오픈 준비 중인 미리보기 화면이에요. 아직 실제 접수는 되지 않아요."); return; }
    if (PM.closed) { err(""); toast("온라인 접수는 곧 열려요. 조금만 기다려주세요."); return; }
    if (!S.token) { err("휴대폰 인증을 먼저 해주세요."); return; }
    S.sending = true; $("submitBtn").disabled = true; err("");
    try {
      const r = await api("/api/leads", {
        verify_token: S.token, category: PM.category, name: $("fName").value.trim(), phone: $("fPhone").value,
        sido: S.addr.sido, sigungu: S.addr.sigungu, dong: S.addr.dong, addr: S.addr.addr, addr2: $("fAddr2").value.trim(),
        req: S.req.startsWith("기타") ? "기타" : S.req, note: $("fMemo").value.trim(),
        compare_ok: $("fCompare").checked, landing: PM.slug, source: new URLSearchParams(location.search).get("src") || "",
        website: $("website").value,
      });
      showDone(r);
    } catch (e2) { err(e2.message); }
    finally { S.sending = false; $("submitBtn").disabled = false; }
  });

  function showDone(r) {
    const night = isNight();
    let title = "접수가 완료됐습니다", p = "담당 기사님께 바로 전달합니다.";
    if (r.status === "free" && r.reason === "중복 문의") { title = "이미 접수된 문의가 있어요"; p = "같은 번호로 접수된 문의가 있어 그 문의로 연락드립니다."; }
    else if (r.status === "free" && r.reason === "서비스 지역 아님") { title = "아직 준비 중인 지역이에요"; p = "입력하신 주소는 아직 기사님이 없는 지역이에요. 불편을 드려 죄송합니다."; }
    $("doneT").textContent = title; $("doneP").textContent = p;
    $("doneWhen").textContent = night ? "내일 오전 가장 먼저 연락드립니다" : "곧 연락드립니다";
    $("formCard").hidden = true; $("doneCard").hidden = false;
    $("doneCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("again").onclick = () => { $("doneCard").hidden = true; $("formCard").hidden = false; S.token = ""; $("verified").hidden = true; $("fCode").value = ""; };

  $("dockForm").onclick = () => {
    $("formCard").hidden = false; $("doneCard").hidden = true;
    $("formCard").scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // 사진 띠: 실제 사진이 있으면 사진, 없으면 임시 그림
  const SHOTS = [["출동 차량", "van"], ["고압 세척", "jet"], ["변기 작업", "toilet"], ["배관 내시경", "scope"], ["싱크대 배관", "sink"], ["현장 기사", "tech"], ["장비 준비", "tools"], ["작업 완료", "done"]];
  const track = $("reelTrack");
  if (PM.photos && PM.photos.length) {
    const list = [...PM.photos, ...PM.photos];
    track.innerHTML = list.map((x, i) => `<figure${i >= PM.photos.length ? ' aria-hidden="true"' : ""}><img src="${x.src}" alt="${x.cap}" loading="lazy"><figcaption>${x.cap}</figcaption></figure>`).join("");
  } else {
    const list = [...SHOTS, ...SHOTS];
    track.innerHTML = list.map((x, i) => `<figure${i >= SHOTS.length ? ' aria-hidden="true"' : ""}><canvas data-k="${x[1]}" data-i="${i % SHOTS.length}" role="img" aria-label="${x[0]} 예시 이미지"></canvas><figcaption>${x[0]}</figcaption></figure>`).join("");
    track.querySelectorAll("canvas").forEach((c) => paint(c, c.dataset.k, +c.dataset.i + 1));
  }
  function paint(cv, k, seed) {
    const W = 184, H = 136; cv.width = W; cv.height = H; const g = cv.getContext("2d");
    let r = seed * 9301 + 49297; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    const bg = { van: ["#7b8a96", "#3c4650"], jet: ["#5f6e74", "#2b3438"], toilet: ["#d9d4cc", "#8f877c"], scope: ["#33373d", "#15171a"], sink: ["#b9b2a6", "#5f574c"], tech: ["#8a7a6c", "#3e342c"], tools: ["#6e6256", "#2f2822"], done: ["#e3ddd3", "#9a9183"] }[k];
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, bg[0]); gr.addColorStop(1, bg[1]); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.9;
    if (k === "van") { g.fillStyle = "#f4f4f2"; g.fillRect(24, 52, 120, 46); g.fillRect(126, 62, 34, 36); g.fillStyle = "#9fb7c9"; g.fillRect(130, 66, 22, 14); g.fillStyle = "#D6336C"; g.fillRect(24, 76, 120, 6); g.fillStyle = "#1d1f22"; [[52, 100], [132, 100]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill(); }); }
    if (k === "jet") { g.strokeStyle = "#c9ccce"; g.lineWidth = 8; g.beginPath(); g.moveTo(20, 120); g.quadraticCurveTo(80, 40, 150, 70); g.stroke(); g.strokeStyle = "rgba(220,240,255,.7)"; g.lineWidth = 2; for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(150, 70); g.lineTo(165 + rnd() * 18, 60 + rnd() * 30); g.stroke(); } }
    if (k === "toilet") { g.fillStyle = "#fbfaf7"; g.beginPath(); g.ellipse(92, 88, 46, 26, 0, 0, 7); g.fill(); g.fillRect(60, 30, 64, 40); g.fillStyle = "#c9c3b8"; g.beginPath(); g.ellipse(92, 86, 30, 14, 0, 0, 7); g.fill(); g.fillStyle = "#3b6aa8"; g.fillRect(140, 40, 10, 70); }
    if (k === "scope") { g.strokeStyle = "#5d6a74"; g.lineWidth = 18; g.beginPath(); g.arc(92, 68, 46, 0, 7); g.stroke(); g.fillStyle = "#0c0d0f"; g.beginPath(); g.arc(92, 68, 36, 0, 7); g.fill(); g.fillStyle = "rgba(140,170,120,.5)"; g.beginPath(); g.arc(84, 78, 16, 0, 7); g.fill(); }
    if (k === "sink") { g.fillStyle = "#cfd3d6"; g.fillRect(20, 30, 144, 26); g.fillStyle = "#8d9397"; g.fillRect(84, 56, 12, 40); g.beginPath(); g.arc(90, 100, 16, 0, 3.2); g.lineWidth = 10; g.strokeStyle = "#8d9397"; g.stroke(); }
    if (k === "tech") { g.fillStyle = "#2c3e57"; g.beginPath(); g.ellipse(92, 120, 48, 40, 0, 3.14, 0); g.fill(); g.fillStyle = "#d8b49a"; g.beginPath(); g.arc(92, 58, 20, 0, 7); g.fill(); g.fillStyle = "#D6336C"; g.beginPath(); g.ellipse(92, 44, 24, 12, 0, 3.14, 0); g.fill(); g.fillRect(66, 42, 52, 6); }
    if (k === "tools") { g.fillStyle = "#b23a3a"; g.fillRect(28, 70, 128, 46); g.fillStyle = "#7a2626"; g.fillRect(28, 70, 128, 8); g.strokeStyle = "#c8c8c8"; g.lineWidth = 6; g.beginPath(); g.moveTo(50, 62); g.lineTo(90, 30); g.stroke(); g.beginPath(); g.moveTo(110, 64); g.lineTo(140, 26); g.stroke(); }
    if (k === "done") { g.fillStyle = "#f7f6f2"; g.fillRect(30, 40, 124, 70); g.fillStyle = "#1f7a4d"; g.beginPath(); g.arc(92, 75, 22, 0, 7); g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 6; g.beginPath(); g.moveTo(80, 76); g.lineTo(89, 85); g.lineTo(105, 66); g.stroke(); }
    g.globalAlpha = 1;
    const img = g.getImageData(0, 0, W, H), d = img.data; for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n; } g.putImageData(img, 0, 0);
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.45)"); g.fillStyle = v; g.fillRect(0, 0, W, H);
  }
})();
