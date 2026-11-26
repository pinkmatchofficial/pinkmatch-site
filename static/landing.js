/* 핑크 랜딩 공통 스크립트. 페이지별 값은 window.PM (build.py가 넣음) */
(function () {
  const PM = window.PM;
  const $ = (id) => document.getElementById(id);
  const LEAK = !!PM.leak;  // 누수 페이지 (/{지역}/leak/)
  const THAW = !!PM.thaw;  // 해빙 페이지 (/{지역}/thaw/)
  const SVC = PM.svc || "";  // 서비스별 페이지 (변기·싱크대·하수구) — 업종 고정
  const SVCK = ["toilet", "sink", "drain"].find((k) => PM.slug.endsWith("/" + k)) || "";
  const WC = PM.svc === "화장실";  // 화장실 페이지: 검색어에 따라 변기·세면대·욕조로 바꿔 보여줌
  const WCAT = (() => {
    if (!WC) return null;
    const u = new URLSearchParams(location.search);
    const text = `${u.get("n_query") || ""} ${u.get("n_keyword") || u.get("utm_term") || u.get("keyword") || ""}`.replace(/\s+/g, "");
    const RULES = [["세면대", /세면대|세면기|세숫대|새면대/], ["욕조", /욕조/], ["샤워실", /샤워/], ["변기", /변기|번기|변끼|벤기/]];
    for (const [name, re] of RULES) if (re.test(text)) return name;
    return null;
  })();
  // 문의 칩: 이 페이지 업종을 앞에, 다른 업종은 끝쪽에 (혹시 다른 문제로 들어온 경우)
  const REQS = LEAK ? ["바닥·천장 누수", "벽·배관 누수", "변기·수전 주변", "배관 막힘", "기타 (직접 입력)"]
             : THAW ? ["수도가 안 나와요", "배관·계량기 동파", "온수가 안 나와요", "누수", "배관 막힘", "기타 (직접 입력)"]
             : WC ? ["변기", "세면대", "욕조", "샤워실", "싱크대", "하수구", "기타 (직접 입력)"]
             : SVC === "싱크대" ? ["싱크대", "변기", "하수구", "세면대", "욕조", "기타 (직접 입력)"]
             : SVC === "하수구" ? ["하수구", "욕실 배수구", "베란다", "세탁실", "변기", "싱크대", "기타 (직접 입력)"]
                    : ["변기", "싱크대", "하수구", "세면대", "욕조", "세탁실", "베란다", "기타 (직접 입력)"];
  const S = { req: LEAK ? "바닥·천장 누수" : THAW ? "수도가 안 나와요" : (WC ? (WCAT || "변기") : (SVC || "변기")), addr: null, token: "", sending: false };

  function toast(m) { const t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600); }
  function err(m) { const e = $("formErr"); e.textContent = m; e.hidden = !m; }
  function kstHour() { return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "numeric", hourCycle: "h23" }).format(new Date())); }
  // 전화 받는 시간 [시작, 끝] (예: 6시~새벽 1시). 그 밖(새벽)은 온라인 접수만
  const HRS = (PM.hours && PM.hours.length === 2) ? PM.hours : [0, 0];
  const inRange = (h, a, b) => a === b ? true : (a < b ? h >= a && h < b : h >= a || h < b);
  const FORCE_NIGHT = new URLSearchParams(location.search).get("pm_night") === "1";  // 미리보기용
  const isPhoneTime = () => !FORCE_NIGHT && inRange(kstHour(), HRS[0], HRS[1]);
  const isLate = () => isPhoneTime() && inRange(kstHour(), 22, HRS[1] || 24);
  const isNight = () => !isPhoneTime();
  async function api(path, body) {
    const r = await fetch(PM.api + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let data = {}; try { data = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(data.detail || "잠시 후 다시 시도해주세요.");
    return data;
  }
  const fmtPhone = (v) => { const d = v.replace(/\D/g, "").slice(0, 11); return d.length < 4 ? d : d.length < 8 ? d.slice(0, 3) + "-" + d.slice(3) : d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7); };

  // 검색어 지역과 페이지 지역이 다르면(확장검색으로 다른 지역 키워드에 걸린 경우) 검색어 지역 페이지로 옮김
  (function fixRegion() {
    const q0 = new URLSearchParams(location.search);
    if (q0.get("pm_rd")) return;
    const q = (q0.get("n_query") || q0.get("utm_term") || "").replace(/\s+/g, "");
    const kw0 = (q0.get("n_keyword") || "").replace(/\s+/g, "");
    if ((!q || q.length < 3) && kw0.length < 3) return;
    const isSido = !!PM.sido && PM.label === PM.sido;  // 시·도 전체 페이지(부산, 경남 등)는 더 좁은 지역이 있으면 그쪽으로
    const isSub = PM.slug.includes("/");  // 동·역 페이지
    // 동·역 페이지인데 검색어나 키워드에 이 동·역 이름이 있으면 그대로
    // 단, 역 페이지인데 검색어에 같은 이름의 '동'이 있으면(마곡역 페이지 · 검색어 마곡동) 동 페이지를 찾으러 감
    const stem = (PM.label || "").replace(/역$/, "");
    const wantsDong = /역$/.test(PM.label || "") && stem.length >= 2 && q.includes(stem + "동");
    if (isSub && PM.label && !wantsDong && (q.includes(PM.label) || kw0.includes(PM.label))) return;  // 역 페이지에 '역' 없이(마곡) 들어오면 같은 이름 동(마곡동)이 있는지 아래에서 찾음
    // 화면은 가리지 않음: 바로 보여주고, 동·역 페이지로 옮겨야 할 때만 옮김
    const show = () => {};
    const t = 0;
    fetch("/static/rg.json").then((r) => r.json()).then((RG) => {
      // 업종·작업 단어는 지우고 남은 글자에서만 지역 이름을 찾음 (예: "하수구"의 "하"를 지역으로 착각하지 않게)
      const clean = (t) => t.replace(/뚫어뻥|뚤어뻥|뚫어펑|양변기|좌변기|변기|하수구|하수관|오수관|싱크대|씽크대|세면대|배수구|배관|화장실|욕실|욕조|주방|부엌|베란다|세탁실|막혔을때|막힘|뚫는곳|뚫는업체|뚫어주는곳|뚫음|업체|비용|역류|청소|고압세척|출장|근처|전문|24시|누수탐지|누수|탐지|수리|수도관|수도|동파|해빙|계량기|얼었을때|얼음|녹이기|온수/g, "|");
      const qr = clean(q);
      const gHits = (text) => {  // 글자 안의 구·시 이름 → 그 지역 경로들
        const gk = Object.keys(RG.g).filter((k) => k.length >= 2 && text.includes(k) && !(isSido && k === PM.sido)).sort((a, b) => b.length - a.length);
        let g = gk.length ? RG.g[gk[0]] : [];
        if (g.length > 1) { const nw = gk.flatMap((k) => RG.g[k]).filter((v, i, a) => a.indexOf(v) !== i); if (nw.length) g = [nw[0]]; }
        return g;
      };
      const gs = gHits(qr);
      const base = PM.slug.split("/")[0];
      const sidoKey = isSido ? base : base.split("-")[0];  // seoul-eunpyeong → seoul
      const inHere = (c) => c.filter(([p, par]) => par === base || (isSido && (par || p).startsWith(base + "-")));
      const sameSido = (c) => c.filter(([p, par]) => (par || p).split("-")[0] === sidoKey);
      // 동·역 이름 찾기: 글자에 구·시 이름이 있으면 그 안에서, 없으면 지금 들어온 지역 → 같은 시·도 안에서만 (다른 시·도로는 넘기지 않음)
      const findDong = (text) => {
        const g = gHits(text);
        const keys = Object.keys(RG.d).filter((k) => k.length >= 2 && text.includes(k) && !RG.g[k]).sort((a, b) => b.length - a.length);  // 구·시 이름과 같은 글자(안양·성동 등)는 동으로 보지 않음
        for (const k of ((LEAK || THAW) && document.documentElement.dataset.lt !== "1" ? [] : keys)) {  // 누수·해빙: 동·역 페이지가 있는 사이트(pipe2)에서만 동·역으로
          let c = RG.d[k];
          if (g.length) c = c.filter(([p, par]) => g.includes(par) || g.includes(p));
          else { const h = inHere(c); c = h.length ? h : sameSido(c); }
          if (c.length === 1) return c[0][0];
        }
        return "";
      };
      let target = findDong(qr);
      if (!target) {  // 검색어에 동 이름이 없으면 광고 키워드에서 (예: 키워드 진관동변기막힘 · 검색어 변기막힘)
        if (kw0) target = findDong(clean(kw0));
      }
      if (!target && gs.length === 1) target = gs[0];
      if (target && LEAK) target += "/leak";
      if (target && THAW) target += "/thaw";
      if (target && SVCK) target += "/" + SVCK;  // 서비스별 페이지는 같은 서비스의 동·역 페이지로
      if (target && target !== PM.slug) {
        q0.set("pm_rd", "1");
        location.replace("/" + target + "/?" + q0.toString() + location.hash);
        return;
      }
      clearTimeout(t); show();
    }).catch(() => { clearTimeout(t); show(); });
  })();

  // 유입 경로 기억 (광고 꼬리표·이전 페이지). 광고로 다시 들어오면 새 값으로 바뀜, 30일 보관
  // 첫 화면 문구 맞춤은 이번 방문 주소에 붙은 값만 씀 (예전에 기억한 광고 검색어로 바꾸지 않음)
  const CURQ = (() => { const u = new URLSearchParams(location.search), g = (k) => (u.get(k) || "").trim();
    return { query: g("n_query"), kw: g("n_keyword") || g("utm_term") || g("keyword") }; })();
  const SRC = (() => {
    const q = new URLSearchParams(location.search), g = (k) => (q.get(k) || "").trim();
    let saved = null; try { saved = JSON.parse(localStorage.getItem("pm_src") || "null"); } catch (e) {}
    if (saved && Date.now() - (saved.t || 0) > 30 * 864e5) saved = null;
    const ref = document.referrer && !document.referrer.includes(location.hostname) ? document.referrer : "";
    let host = ""; try { host = ref ? new URL(ref).hostname : ""; } catch (e) {}
    const now = { kw: g("n_keyword") || g("utm_term") || g("keyword"), query: g("n_query"),
      campaign: [g("n_campaign") || g("utm_campaign"), g("n_ad_group")].filter(Boolean).join(" / "),
      cid: g("pm_cid") || g("utm_id"), gid: g("n_ad_group") || g("pm_gid"),
      gclid: g("gclid") || (g("gbraid") ? "gbraid:" + g("gbraid") : "") || (g("wbraid") ? "wbraid:" + g("wbraid") : ""),
      media: "", ref: ref.slice(0, 200), device: /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "모바일" : "PC" };
    if (g("n_media") || g("n_keyword") || g("n_query")) now.media = g("n_campaign_type") === "2" ? "네이버 쇼핑검색" : "네이버 파워링크";
    else if (g("gclid") || g("gad_source")) now.media = "구글 광고";
    else if (g("utm_source")) now.media = g("utm_source") + (g("utm_medium") ? " / " + g("utm_medium") : "");
    else if (g("src")) now.media = g("src");
    else if (/naver\./.test(host)) now.media = "네이버 검색(자연)";
    else if (/google\./.test(host)) now.media = "구글 검색(자연)";
    else if (/daum\.|kakao\./.test(host)) now.media = "다음·카카오";
    else if (/youtube\.|youtu\.be/.test(host)) now.media = "유튜브";
    else if (/instagram\.|facebook\./.test(host)) now.media = "인스타그램·페이스북";
    else if (host) now.media = host;
    // 이번 방문에 광고 꼬리표나 바깥 사이트가 있으면 그 값으로, 없으면 전에 기억한 값 (마지막 유입 기준)
    const src = now.media ? { ...now, t: Date.now() } : (saved || { ...now, media: "직접 방문", t: Date.now() });
    src.device = now.device;
    try { localStorage.setItem("pm_src", JSON.stringify(src)); } catch (e) {}
    const { t, ...out } = src; return out;
  })();

  // 검색어 업종 맞춤: 광고 키워드 · 실제 검색어에 업종 단어가 있으면 첫 제목 · 문제 위치 · 사진 순서를 그 업종으로.
  // 고객이 친 글자는 화면에 그대로 쓰지 않고, 미리 정한 문구만 보여줌
  const CAT = (() => {
    if (LEAK || THAW || SVC) return null;  // 서비스별 페이지는 업종 고정
    const text = `${CURQ.query} ${CURQ.kw}`.replace(/\s+/g, "");
    if (!text) return null;
    const RULES = [
      ["세면대", /세면대|세면기|세숫대|새면대/], ["싱크대", /싱크|씽크|싱쿠|씽쿠|싱끄|씽끄|주방|부엌|개수대|설거지/],
      ["변기", /변기|번기|변끼|벤기|화장실/], ["하수구", /하수구|하수규|하스구|배수구|하수관|욕실|욕조|세탁실|베란다|배수관/],
    ];
    for (const [name, re] of RULES) if (re.test(text)) return name;
    return null;
  })();
  // 광역시 구·동 페이지인데 검색어에 이 지역 이름이 없으면(지역 없는 검색 · 도시 전체 노출) 제목 지역을 도시 이름으로
  const METRO = ["서울", "부산", "대구", "인천", "광주", "대전", "울산"];
  const AREA = null;  // 지역 제목은 들어온 페이지 지역 그대로 (검색어에 지역이 없어도 '서울' 같은 도시 이름으로 바꾸지 않음)
  // 사진 위 큰 제목: {지역} {업종}막힘, 30분 내 방문 (검색어에 맞춤)
  if (AREA && $("hbArea")) $("hbArea").textContent = AREA;
  if (CAT) {
    if ($("hbCat")) $("hbCat").textContent = `${CAT}막힘,`;
    if ($("riskT")) $("riskT").textContent = `${CAT}막힘, 그냥 두면 이렇게 돼요`;
    S.req = CAT;
  }
  // 별칭(건대·홍대·DMC 등)으로 검색해서 들어오면 첫 화면 지역 이름도 별칭으로 (예: 화양동 페이지 → "건대")
  {
    const qq = `${CURQ.query} ${CURQ.kw}`.replace(/\s+/g, "").toLowerCase();
    const al = (PM.alias || []).filter((a) => qq && qq.includes(a.toLowerCase())).sort((a, b) => b.length - a.length)[0];
    if (al && !qq.includes((PM.label || "").toLowerCase())) {
      if ($("hbArea")) $("hbArea").textContent = al;
      const hl0 = document.querySelector("header.bar .small.muted");
      if (hl0 && PM.label) hl0.textContent = hl0.textContent.replace(PM.label, al);
    }
  }
  // 첫 화면 배경 사진: 검색어 업종(변기·싱크대·하수구)과 누수 페이지에 맞춰 (업종 페이지는 이미 고정 사진)
  {
    const bg = LEAK ? "s-leak" : ({ 변기: "s-toilet", 세면대: "s-toilet", 싱크대: "s-sink", 하수구: "s-drain" })[CAT] || "";
    const mc = document.querySelector(".mcard");
    if (bg && mc && !SVC && !THAW) mc.classList.add(bg);
    const hl = document.querySelector("header.bar .small.muted");  // 오른쪽 위 작은 글씨도 검색어 업종으로
    if (hl && CAT) hl.textContent = hl.textContent.replace("배관 막힘", `${CAT} 막힘`);
  }
  if (WCAT) {
    if ($("hbCat")) $("hbCat").textContent = `${WCAT}막힘,`;
    if ($("riskT")) $("riskT").textContent = `${WCAT}막힘, 그냥 두면 이렇게 돼요`;
  }
  // 구글 광고 전환 (라벨이 설정된 것만)
  function gconv(kind) {
    const to = (window.PM_GADS || {})[kind];
    if (!to || typeof gtag !== "function") return;
    try { gtag("event", "conversion", { send_to: to, value: 10000, currency: "KRW", transport_type: "beacon" }); } catch (e) {}
  }
  // 전화 버튼 클릭 기록 (통화 기록과 시간으로 맞춰 키워드 추정)
  document.querySelectorAll('a[href^="tel:"]').forEach((a) => a.addEventListener("click", () => {
    if (PM.preview) return;
    if (!a.classList.contains("ac-call")) {  // 통화 후 '다시 전화'는 전환으로 두 번 세지 않음
      gconv("call");
      if (window.pmNaverConv) window.pmNaverConv("custom001");  // 네이버: 전화 버튼 클릭
    }
    const body = JSON.stringify({ landing: PM.slug, src: SRC });
    try { if (!navigator.sendBeacon(PM.api + "/api/click", new Blob([body], { type: "text/plain" }))) throw 0; }
    catch (e) { fetch(PM.api + "/api/click", { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body, keepalive: true }).catch(() => {}); }
  }));

  // 통화 마치고 페이지로 돌아온 사람에게 한 번만 안내 (전화 버튼 누른 뒤 8초~30분 안에 돌아왔을 때)
  let telAt = 0;
  document.querySelectorAll('a[href^="tel:"]').forEach((a) => a.addEventListener("click", () => { telAt = Date.now(); }));
  function showAfterCall() {
    if (!telAt || !$("afterCall")) return;
    const gap = Date.now() - telAt; telAt = 0;
    if (gap < 8000 || gap > 30 * 60 * 1000) return;
    try { if (sessionStorage.getItem("pm_after")) return; sessionStorage.setItem("pm_after", "1"); } catch (e) {}
    $("afterCall").hidden = false; requestAnimationFrame(() => $("afterCall").classList.add("show"));
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) showAfterCall(); });
  window.addEventListener("focus", showAfterCall);
  function closeAfter() { $("afterCall").classList.remove("show"); setTimeout(() => ($("afterCall").hidden = true), 250); }
  if ($("afterClose")) $("afterClose").onclick = closeAfter;
  if ($("afterCall")) $("afterCall").addEventListener("click", (e) => { if (e.target === $("afterCall")) closeAfter(); });
  if (new URLSearchParams(location.search).get("pm_after") === "1" && $("afterCall")) { $("afterCall").hidden = false; $("afterCall").classList.add("show"); }  // 미리보기용

  // 시간대별 화면: 전화 시간엔 전화만(22시~끝시엔 '지금도 출동 가능' 띠), 새벽엔 전화 숨기고 온라인 접수만
  // 야간(전화 쉬는 시간) 문구 바꾸기: data-night 가 있는 곳은 밤에 그 글로, 낮엔 원래 글로
  const NIGHT_EL = [...document.querySelectorAll("[data-night]")].map((el) => [el, el.innerHTML, el.dataset.night]);
  function nightLeft() {
    const m = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", minute: "numeric" }).format(new Date()));
    let left = ((HRS[0] - kstHour() + 24) % 24) * 60 - m;
    if (left <= 0) return "";
    const h = Math.floor(left / 60), mm = left % 60;
    return `오전 ${HRS[0]}시 연락 시작까지 ${h ? h + "시간 " : ""}${mm}분 남았어요`;
  }
  // 온라인 접수: 낮에는 위쪽은 버튼(누르면 펼침), 맨 아래는 폼. 밤에는 위쪽에 폼을 바로 펼침
  function placeForm(top) {
    const box = $("formBox"), slot = $(top ? "formTop" : "formBottom");
    if (box && slot && box.parentNode !== slot) slot.appendChild(box);
    if ($("formOpen")) { $("formOpen").hidden = top; $("formOpen").setAttribute("aria-expanded", top ? "true" : "false"); }
  }
  function applyHours() {
    const phone = isPhoneTime(), hasCall = !!$("callWrap");
    document.body.classList.toggle("night", !phone);
    NIGHT_EL.forEach(([el, day, night]) => { el.innerHTML = phone ? day : night; });
    if (!phone && $("nightLeft")) $("nightLeft").textContent = FORCE_NIGHT ? "오전 6시 연락 시작까지 3시간 20분 남았어요" : nightLeft();
    $("nightNotice").hidden = phone;
    $("lateNotice").hidden = !(phone && isLate());
    if (hasCall) {
      $("callWrap").hidden = !phone;
      if ($("dockCall")) $("dockCall").hidden = !phone;
      // 낮에도 온라인 접수 열어 둠: 전화가 먼저(크게), 통화가 어려우면 아래 접수
      $("formCard").hidden = !$("doneCard").hidden;
      placeForm(!phone || S.formOpened);
      if ($("midCall")) $("midCall").hidden = !phone;
      $("dockForm").hidden = false;
      $("dock").querySelector(".in").classList.toggle("one", !phone);
      $("dockNote").textContent = phone ? "전화 상담 오전 6시 ~ 새벽 1시 · 온라인 접수 24시간" : "오전 6시, 가장 먼저 연락드려요";
      $("dockForm").textContent = phone ? "상담 접수" : "야간 접수 남기기";
    }
  }
  if (!$("callWrap")) placeForm(true);
  applyHours(); setInterval(applyHours, 60000);

  // 야간: 연락받을 시간 선택
  S.want = "";
  document.querySelectorAll("#wantChips .chip").forEach((b) => (b.onclick = () => {
    S.want = b.textContent;
    document.querySelectorAll("#wantChips .chip").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }));
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
  $("fPhone").addEventListener("input", (e) => { e.target.value = fmtPhone(e.target.value); if (S.token && $("verified")) { S.token = ""; $("verified").hidden = true; } });
  if (PM.verify) {
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
  }

  // 접수
  $("leadForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (S.sending) return;
    // 지역 페이지는 주소 없이도 접수 (그 페이지 지역으로 배정, 상세 주소는 통화로)
    const area = $("fArea") ? $("fArea").value.trim() : "";
    const addr = S.addr || (PM.sido && PM.gu ? { sido: PM.sido, sigungu: PM.gu, dong: "", addr: area } : null);
    if (!addr) { err("주소를 검색해서 선택해주세요."); return; }
    if (S.req.startsWith("기타") && !$("fMemo").value.trim()) { err("어떤 문제인지 적어주세요."); return; }
    if (!$("fAgree").checked) { err("개인정보 수집·이용 및 제공에 동의해주세요."); return; }
    if (PM.preview) { err(""); toast("오픈 준비 중인 미리보기 화면이에요. 아직 실제 접수는 되지 않아요."); return; }
    if (PM.closed) { err(""); toast("온라인 접수는 곧 열려요. 조금만 기다려주세요."); return; }
    if (!/^01[016789]-\d{3,4}-\d{4}$/.test($("fPhone").value)) { err("휴대폰 번호를 다시 확인해주세요."); return; }
    if (PM.verify && !S.token) { err("휴대폰 인증을 먼저 해주세요."); return; }
    const nightNow = isNight();
    if (nightNow && !S.want) { err("연락받을 시간을 골라주세요."); $("wantWrap").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    S.sending = true; $("submitBtn").disabled = true; err("");
    try {
      const r = await api("/api/leads", {
        verify_token: S.token || "", category: PM.category, name: $("fName").value.trim(), phone: $("fPhone").value,
        sido: addr.sido, sigungu: addr.sigungu, dong: addr.dong, addr: addr.addr, addr2: $("fAddr2").value.trim(),
        req: S.req.startsWith("기타") ? "기타" : S.req, note: $("fMemo").value.trim(),
        landing: PM.slug, source: new URLSearchParams(location.search).get("src") || "", src: SRC,
        website: $("website").value, want_time: nightNow ? S.want : "",
      });
      if (!(r.status === "free" && r.reason === "중복 문의")) { gconv("lead"); if (window.pmNaverConv) window.pmNaverConv("lead"); }
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
    $("doneWhen").textContent = night ? (S.want ? `고르신 시간(${S.want})에 맞춰 연락드립니다` : "오전 6시부터 가장 먼저 연락드립니다") : "곧 연락드립니다";
    $("formCard").hidden = true; $("doneCard").hidden = false;
    $("doneCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("again").onclick = () => { $("doneCard").hidden = true; $("formCard").hidden = false; S.token = ""; $("verified").hidden = true; $("fCode").value = ""; };

  if ($("nightGo")) $("nightGo").onclick = (e) => { e.preventDefault(); $("dockForm").click(); };
  if ($("formOpen")) $("formOpen").onclick = () => {
    S.formOpened = true; placeForm(true);
    $("formCard").hidden = false; $("doneCard").hidden = true;
    $("formCard").scrollIntoView({ behavior: "smooth", block: "start" });
  };
  $("dockForm").onclick = () => {
    $("formCard").hidden = false; $("doneCard").hidden = true;
    $("formCard").scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // 사진 띠: 실제 사진이 있으면 사진, 없으면 임시 그림
  const SHOTS = [["출동 차량", "van"], ["고압 세척", "jet"], ["변기 작업", "toilet"], ["배관 내시경", "scope"], ["싱크대 배관", "sink"], ["현장 기사", "tech"], ["장비 준비", "tools"], ["작업 완료", "done"]];
  const track = $("reelTrack");
  if (!track) { /* 첫 화면 사진 띠 없음 (모델 배너) */ } else if (PM.photos && PM.photos.length) {
    let shots = PM.photos.slice(0, 6);
    if (CAT) { const hit = shots.filter((x) => x.cap.includes(CAT === "세면대" ? "싱크대" : CAT)); shots = [...hit, ...shots.filter((x) => !hit.includes(x))]; }  // 작업 장면 6장 (장비 사진은 아래 '실제 작업 현장'에)
    const list = [...shots, ...shots];
    track.innerHTML = list.map((x, i) => `<figure${i >= shots.length ? ' aria-hidden="true"' : ""}><img src="${x.src}" alt="${x.cap}" decoding="async"><figcaption>${x.cap}</figcaption></figure>`).join("");
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
