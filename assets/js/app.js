/* 수도권 물놀이장 지도 — 앱 로직 */
(function () {
  'use strict';

  var FACILITIES = window.FACILITIES || [];
  var DISTRICT_META = window.DISTRICT_META || {};
  var DATA_META = window.DATA_META || {};

  var TYPE_EMOJI = {
    '공원 물놀이터': '💦',
    '물놀이 분수': '⛲',
    '한강 물놀이장': '🏊',
    '하천/계곡': '🏞️',
    '야외 수영장': '🩱',
    '기타': '🌊'
  };
  var TYPE_ORDER = ['공원 물놀이터', '물놀이 분수', '한강 물놀이장', '하천/계곡', '야외 수영장', '기타'];
  var STATUS_ORDER = ['운영중', '운영예정', '2026 확인', '전년도 확인', '재확인 필요', '기타 확인', '중단'];
  var REGION_ORDER = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  var REGION_VIEW = {
    '': { center: [36.30, 127.80], zoom: 7 },
    '서울': { center: [37.5642, 126.99], zoom: 11 },
    '경기': { center: [37.42, 127.18], zoom: 9 },
    '인천': { center: [37.46, 126.64], zoom: 11 },
    '부산': { center: [35.17, 129.06], zoom: 11 },
    '대구': { center: [35.85, 128.57], zoom: 11 },
    '광주': { center: [35.15, 126.87], zoom: 12 },
    '대전': { center: [36.34, 127.39], zoom: 12 },
    '울산': { center: [35.55, 129.31], zoom: 11 },
    '제주': { center: [33.38, 126.55], zoom: 10 },
    '세종': { center: [36.55, 127.27], zoom: 11 },
    '강원': { center: [37.75, 128.30], zoom: 8 },
    '충북': { center: [36.75, 127.75], zoom: 9 },
    '충남': { center: [36.50, 126.85], zoom: 9 },
    '전북': { center: [35.75, 127.15], zoom: 9 },
    '전남': { center: [34.85, 126.95], zoom: 9 },
    '경북': { center: [36.35, 128.90], zoom: 8 },
    '경남': { center: [35.25, 128.25], zoom: 9 }
  };

  var state = {
    q: '',
    region: '',
    district: '',
    status: '',
    type: '',
    fee: false,       // true = 무료만
    openToday: false,
    favOnly: false,
    view: 'list'
  };

  var favorites = loadFavorites();

  function loadFavorites() {
    try {
      return new Set(JSON.parse(localStorage.getItem('sw_favorites') || '[]'));
    } catch (e) { return new Set(); }
  }
  function saveFavorites() {
    localStorage.setItem('sw_favorites', JSON.stringify(Array.from(favorites)));
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function districtColor(d) {
    return (DISTRICT_META[d] && DISTRICT_META[d].color) || '#6B5B95';
  }

  function statusClass(s) {
    if (s === '운영중') return 'status-운영중';
    if (s === '운영예정') return 'status-운영예정';
    if (s === '중단') return 'status-중단';
    if (s === '재확인 필요') return 'status-재확인';
    return '';
  }

  function explicitPeriodRanges(period) {
    var ranges = [];
    var re = /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s*[~\-–]\s*(?:(\d{4})[.\-/])?(\d{1,2})[.\-/](\d{1,2})/g;
    var m;
    while ((m = re.exec(period || '')) !== null) {
      var start = m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
      var end = (m[4] || m[1]) + '-' + String(m[5]).padStart(2, '0') + '-' + String(m[6]).padStart(2, '0');
      ranges.push([start, end]);
    }
    return ranges;
  }

  /* ---------- 오늘 운영중 판정 ---------- */
  function isOpenToday(f, now) {
    if (['운영중', '운영예정', '2026 확인'].indexOf(f.status) === -1) return false;
    var today = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
    var ranges = explicitPeriodRanges(f.period);
    if (ranges.length > 1) {
      if (!ranges.some(function (range) { return today >= range[0] && today <= range[1]; })) return false;
    } else {
      if (f.periodStart && today < f.periodStart) return false;
      if (f.periodEnd && today > f.periodEnd) return false;
    }
    var closed = f.closedInfo || '';
    var dayKo = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];
    var m = closed.match(/(?:매주\s*)?([월화수목금토일][월화수목금토일·,~\s]*?)(?:요일)?\s*휴/);
    if (m && m[1].indexOf(dayKo) !== -1) return false;
    if (/주말\s*휴/.test(closed) && (now.getDay() === 0 || now.getDay() === 6)) return false;
    if (/평일\s*휴/.test(closed) && now.getDay() >= 1 && now.getDay() <= 5) return false;
    return true;
  }

  /* ---------- 필터링 ---------- */
  function matches(f) {
    if (state.region && f.region !== state.region) return false;
    if (state.district && f.district !== state.district) return false;
    if (state.status && f.status !== state.status) return false;
    if (state.type && f.type !== state.type) return false;
    if (state.fee && f.isFree !== true) return false;
    if (state.favOnly && !favorites.has(f.id)) return false;
    if (state.openToday && !isOpenToday(f, new Date())) return false;
    if (state.q) {
      var q = state.q.toLowerCase();
      var hay = [f.name, f.address, f.district, f.region, f.typeRaw].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  /* ---------- 지도 ---------- */
  var map = L.map('map', { zoomControl: true })
    .setView(REGION_VIEW[''].center, REGION_VIEW[''].zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  var markerLayer = L.layerGroup().addTo(map);
  var markersById = {};

  function renderMarkers(list) {
    markerLayer.clearLayers();
    markersById = {};
    list.forEach(function (f) {
      var approx = f.geo === 'approx';
      var marker = L.circleMarker([f.lat, f.lng], {
        radius: 9,
        fillColor: districtColor(f.district),
        color: '#ffffff',
        weight: 2,
        fillOpacity: approx ? 0.45 : 0.9,
        dashArray: approx ? '3,3' : null
      });
      var popupHtml =
        '<div class="popup-name">' + TYPE_EMOJI[f.type] + ' ' + esc(f.name) + '</div>' +
        '<div class="popup-meta">' + esc(f.district) + ' · ' + esc(f.status) +
        (approx ? ' · 위치는 대략적' : '') + '</div>' +
        '<button class="popup-btn" data-popup-detail="' + f.id + '">자세히 보기</button>';
      marker.bindPopup(popupHtml);
      marker.addTo(markerLayer);
      markersById[f.id] = marker;
    });
  }

  /* ---------- 카드에서 지도 위치로 이동 ---------- */
  function locateOnMap(id) {
    var f = FACILITIES.find(function (x) { return x.id === id; });
    if (!f) return;
    if (window.innerWidth <= 900 && state.view !== 'map') {
      state.view = 'map';
      document.querySelectorAll('#viewToggle .pill').forEach(function (p) {
        p.classList.toggle('active', p.getAttribute('data-view') === 'map');
      });
      var grid = document.querySelector('.content-grid');
      grid.classList.remove('view-list');
      grid.classList.add('view-map');
      setTimeout(function () { map.invalidateSize(); }, 50);
    }
    map.flyTo([f.lat, f.lng], 15, { duration: 0.8 });
    var marker = markersById[f.id];
    if (marker) map.once('moveend', function () { marker.openPopup(); });
  }

  /* ---------- 카드 ---------- */
  function cardHtml(f) {
    var dc = districtColor(f.district);
    var fav = favorites.has(f.id);
    var tags = [
      '<span class="tag district" style="background:' + dc + '">' + esc(f.district) + '</span>',
      '<span class="tag ' + statusClass(f.status) + '">' + esc(f.status) + '</span>'
    ];
    if (f.isFree === true) tags.push('<span class="tag free">무료</span>');
    if (f.isFree === false) tags.push('<span class="tag paid">유료</span>');
    var info = [];
    info.push('<div class="card-info"><span class="ico">📅</span>' + esc(f.period || '기간 정보 없음') + '</div>');
    if (f.hours) info.push('<div class="card-info"><span class="ico">⏰</span>' + esc(f.hours) + '</div>');
    return (
      '<article class="facility-card" data-id="' + f.id + '" style="--cc1:' + dc + '33; --cc2:#FFFFFF">' +
        '<div class="card-emoji">' + TYPE_EMOJI[f.type] +
          '<button class="fav-btn" data-fav="' + f.id + '" aria-label="찜">' + (fav ? '❤️' : '🤍') + '</button>' +
        '</div>' +
        '<div class="card-body">' +
          '<h3 class="card-name">' + esc(f.name) + '</h3>' +
          '<div class="card-tags">' + tags.join('') + '</div>' +
          info.join('') +
          '<button class="card-locate" data-locate="' + f.id + '">📍 위치보기</button>' +
        '</div>' +
      '</article>'
    );
  }

  function renderCards(list) {
    var grid = document.getElementById('cardGrid');
    grid.innerHTML = list.map(cardHtml).join('');
    document.getElementById('emptyState').hidden = list.length > 0;
  }

  /* ---------- 상세 모달 ---------- */
  function detailRow(k, v, isLink) {
    if (!v) return '';
    var val = isLink
      ? '<a href="' + esc(v) + '" target="_blank" rel="noopener">' + esc(v) + '</a>'
      : esc(v);
    return '<div class="detail-item"><span class="k">' + k + '</span><span class="v">' + val + '</span></div>';
  }

  window.openFacilityModal = function (id) {
    var f = FACILITIES.find(function (x) { return x.id === id; });
    if (!f) return;
    var dc = districtColor(f.district);
    var fav = favorites.has(f.id);
    // 인천 구명("인천 중구")에는 지역명이 이미 포함되어 접두사 불필요
    var regionPrefix = f.region === '경기' ? '경기 ' : (f.region === '서울' ? '서울 ' : '');
    var naverUrl = 'https://map.naver.com/p/search/' +
      encodeURIComponent(regionPrefix + f.district + ' ' + f.name);
    var body = document.getElementById('modalBody');
    body.innerHTML =
      '<div class="modal-emoji">' + TYPE_EMOJI[f.type] + '</div>' +
      '<h2 class="modal-title">' + esc(f.name) + '</h2>' +
      '<div class="modal-tags">' +
        '<span class="tag district" style="background:' + dc + '">' + esc(f.district) + '</span>' +
        '<span class="tag ' + statusClass(f.status) + '">' + esc(f.status) + '</span>' +
      '</div>' +
      (f.geo === 'approx'
        ? '<div class="geo-notice">📍 지도 위치는 지자체 기준 대략적인 표시예요. 정확한 위치는 길찾기로 확인하세요.</div>'
        : '') +
      '<div class="detail-list">' +
        detailRow('🏷️ 유형', f.typeRaw) +
        detailRow('📍 주소', f.address) +
        detailRow('📅 운영기간', f.period) +
        detailRow('⏰ 운영시간', f.hours) +
        detailRow('🚫 휴장/중단', f.closedInfo) +
        detailRow('💰 대상/요금', f.feeInfo) +
        detailRow('📝 예약', f.reservation) +
        detailRow('✅ 운영상태', f.statusRaw) +
        detailRow('📰 출처', f.source) +
        detailRow('🔗 링크', f.sourceUrl, true) +
        detailRow('💬 비고', f.note) +
      '</div>' +
      '<div class="modal-links">' +
        '<a class="link-btn map" href="' + naverUrl + '" target="_blank" rel="noopener">🧭 네이버 길찾기</a>' +
        '<button class="link-btn fav" data-fav="' + f.id + '">' + (fav ? '❤️ 찜 해제' : '🤍 찜하기') + '</button>' +
      '</div>';
    document.getElementById('modalOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
  };

  function closeModal() {
    document.getElementById('modalOverlay').hidden = true;
    document.body.style.overflow = '';
  }

  /* ---------- 렌더 파이프라인 ---------- */
  function render() {
    var list = FACILITIES.filter(matches);
    renderMarkers(list);
    renderCards(list);
    document.getElementById('resultCount').textContent =
      '총 ' + list.length + '개의 물놀이장이 있어요' + (list.length < FACILITIES.length ? ' (전체 ' + FACILITIES.length + '개 중)' : '!');
  }

  /* ---------- 초기 UI 구성 ---------- */
  function buildFilterPills() {
    var regionRow = document.getElementById('regionFilters');
    if (regionRow) {
      var presentR = {};
      FACILITIES.forEach(function (f) { presentR[f.region] = true; });
      var rPills = ['<button class="pill active" data-region="">전체</button>'];
      REGION_ORDER.forEach(function (r) {
        if (presentR[r]) rPills.push('<button class="pill" data-region="' + r + '">' + r + '</button>');
      });
      regionRow.insertAdjacentHTML('beforeend', rPills.join(''));
    }

    var statusRow = document.getElementById('statusFilters');
    var present = {};
    FACILITIES.forEach(function (f) { present[f.status] = true; });
    var pills = ['<button class="pill active" data-status="">전체</button>'];
    STATUS_ORDER.forEach(function (s) {
      if (present[s]) pills.push('<button class="pill" data-status="' + s + '">' + s + '</button>');
    });
    statusRow.insertAdjacentHTML('beforeend', pills.join(''));

    var typeRow = document.getElementById('typeFilters');
    var presentT = {};
    FACILITIES.forEach(function (f) { presentT[f.type] = true; });
    var tPills = ['<button class="pill active" data-type="">전체</button>'];
    TYPE_ORDER.forEach(function (t) {
      if (presentT[t]) tPills.push('<button class="pill" data-type="' + t + '">' + TYPE_EMOJI[t] + ' ' + t + '</button>');
    });
    typeRow.insertAdjacentHTML('beforeend', tPills.join(''));
  }

  function buildDistrictSelect() {
    var sel = document.getElementById('districtSelect');
    var districts = Object.keys(DISTRICT_META).sort(function (a, b) { return a.localeCompare(b, 'ko'); });
    var hasCount = {};
    FACILITIES.forEach(function (f) { hasCount[f.district] = (hasCount[f.district] || 0) + 1; });
    REGION_ORDER.forEach(function (r) {
      var group = document.createElement('optgroup');
      group.label = r;
      districts.forEach(function (d) {
        if ((DISTRICT_META[d].region || '서울') !== r) return;
        var opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d + (hasCount[d] ? ' (' + hasCount[d] + ')' : ' (0)');
        group.appendChild(opt);
      });
      if (group.children.length) sel.appendChild(group);
    });
  }

  function buildLegend() {
    document.getElementById('mapLegend').innerHTML =
      '<span><span class="legend-dot" style="background:#FF6B9D"></span>정확 위치</span>' +
      '<span><span class="legend-dot approx" style="background:#6B5B95"></span>대략 위치(지자체 기준)</span>';
  }

  /* ---------- 이벤트 ---------- */
  function setDistrict(d) {
    state.district = d;
    document.getElementById('districtSelect').value = d;
    if (d && DISTRICT_META[d]) {
      map.flyTo([DISTRICT_META[d].lat, DISTRICT_META[d].lng], 13, { duration: 0.8 });
    } else {
      var v = REGION_VIEW[state.region] || REGION_VIEW[''];
      map.flyTo(v.center, v.zoom, { duration: 0.8 });
    }
    render();
  }

  function setRegion(r) {
    state.region = r;
    // 다른 지역의 자치구가 선택돼 있으면 해제
    if (state.district && DISTRICT_META[state.district] &&
        r && (DISTRICT_META[state.district].region || '서울') !== r) {
      state.district = '';
      document.getElementById('districtSelect').value = '';
    }
    document.querySelectorAll('#regionFilters .pill').forEach(function (p) {
      p.classList.toggle('active', p.getAttribute('data-region') === r);
    });
    if (!state.district) {
      var v = REGION_VIEW[r] || REGION_VIEW[''];
      map.flyTo(v.center, v.zoom, { duration: 0.8 });
    }
    render();
  }

  var searchTimer = null;
  document.getElementById('searchInput').addEventListener('input', function (e) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.q = e.target.value.trim();
      render();
    }, 200);
  });

  document.getElementById('districtSelect').addEventListener('change', function (e) {
    setDistrict(e.target.value);
  });

  var filterToggleBtn = document.getElementById('filterToggleBtn');
  var filterGroups = document.getElementById('filterGroups');
  filterToggleBtn.addEventListener('click', function () {
    var willOpen = filterGroups.hidden;
    filterGroups.hidden = !willOpen;
    filterToggleBtn.textContent = willOpen ? '🔼' : '🔽';
    var label = willOpen ? '필터 닫기' : '필터 열기';
    filterToggleBtn.title = label;
    filterToggleBtn.setAttribute('aria-label', label);
    filterToggleBtn.setAttribute('aria-expanded', String(willOpen));
  });

  document.addEventListener('click', function (e) {
    var t = e.target;

    var favBtn = t.closest('[data-fav]');
    if (favBtn) {
      e.stopPropagation();
      var id = Number(favBtn.getAttribute('data-fav'));
      if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
      saveFavorites();
      render();
      if (!document.getElementById('modalOverlay').hidden) window.openFacilityModal(id);
      return;
    }

    var locateBtn = t.closest('[data-locate]');
    if (locateBtn) {
      e.stopPropagation();
      locateOnMap(Number(locateBtn.getAttribute('data-locate')));
      return;
    }

    var popupBtn = t.closest('[data-popup-detail]');
    if (popupBtn) {
      window.openFacilityModal(Number(popupBtn.getAttribute('data-popup-detail')));
      return;
    }

    var regionPill = t.closest('[data-region]');
    if (regionPill) {
      setRegion(regionPill.getAttribute('data-region'));
      return;
    }

    var statusPill = t.closest('[data-status]');
    if (statusPill) {
      state.status = statusPill.getAttribute('data-status');
      document.querySelectorAll('#statusFilters .pill').forEach(function (p) {
        p.classList.toggle('active', p === statusPill);
      });
      render();
      return;
    }

    var typePill = t.closest('[data-type]');
    if (typePill) {
      state.type = typePill.getAttribute('data-type');
      document.querySelectorAll('#typeFilters .pill').forEach(function (p) {
        p.classList.toggle('active', p === typePill);
      });
      render();
      return;
    }

    var togglePill = t.closest('[data-toggle]');
    if (togglePill) {
      var key = togglePill.getAttribute('data-toggle');
      state[key] = !state[key];
      togglePill.classList.toggle('active', state[key]);
      render();
      return;
    }

    var viewBtn = t.closest('[data-view]');
    if (viewBtn) {
      state.view = viewBtn.getAttribute('data-view');
      document.querySelectorAll('#viewToggle .pill').forEach(function (p) {
        p.classList.toggle('active', p === viewBtn);
      });
      var grid = document.querySelector('.content-grid');
      grid.classList.remove('view-map', 'view-list');
      grid.classList.add('view-' + state.view);
      if (state.view === 'map') setTimeout(function () { map.invalidateSize(); }, 50);
      return;
    }

    var card = t.closest('.facility-card');
    if (card) {
      window.openFacilityModal(Number(card.getAttribute('data-id')));
      return;
    }

    if (t.id === 'modalClose' || t.id === 'modalOverlay') closeModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  document.getElementById('resetBtn').addEventListener('click', function () {
    state.q = ''; state.region = ''; state.status = ''; state.type = '';
    state.fee = false; state.openToday = false; state.favOnly = false;
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('.filter-bar .pill').forEach(function (p) {
      p.classList.toggle('active',
        p.getAttribute('data-region') === '' ||
        p.getAttribute('data-status') === '' ||
        p.getAttribute('data-type') === '');
    });
    setDistrict('');
  });

  /* ---------- 시작 ---------- */
  document.getElementById('totalCount').textContent = FACILITIES.length;
  document.getElementById('surveyDate').textContent = DATA_META.surveyDate || '';
  buildFilterPills();
  buildDistrictSelect();
  buildLegend();
  // 모바일 기본은 목록 뷰
  if (window.innerWidth <= 900) {
    document.querySelector('.content-grid').classList.add('view-list');
  }
  // 리포트 페이지 등에서 ?district=자치구 로 진입한 경우 필터 적용
  var paramDistrict = new URLSearchParams(location.search).get('district');
  if (paramDistrict && DISTRICT_META[paramDistrict]) {
    setDistrict(paramDistrict);
  } else {
    render();
  }

  // PWA: 서비스 워커 등록 (홈 화면 설치 · 오프라인 지원)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('서비스 워커 등록 실패:', err);
      });
    });
  }
})();
