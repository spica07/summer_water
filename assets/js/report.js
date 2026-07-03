/* 지자체별 요약 리포트 */
(function () {
  'use strict';

  var FACILITIES = window.FACILITIES || [];
  var DISTRICT_META = window.DISTRICT_META || {};
  var DATA_META = window.DATA_META || {};

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

  function count(list, pred) {
    return list.filter(pred).length;
  }

  /* ---------- 핵심 지표 타일 ---------- */
  var operating = count(FACILITIES, function (f) { return f.status === '운영중'; });
  var confirmed2026 = count(FACILITIES, function (f) {
    return f.status === '운영중' || f.status === '2026 확인' || f.status === '운영예정';
  });
  var free = count(FACILITIES, function (f) { return f.isFree === true; });
  var tiles = [
    { num: FACILITIES.length, lbl: '전체 물놀이장' },
    { num: operating, lbl: '현재 운영중' },
    { num: confirmed2026, lbl: '2026 운영 확인·예정' },
    { num: free, lbl: '무료 시설' }
  ];
  ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
   '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'].forEach(function (r) {
    var n = count(FACILITIES, function (f) { return f.region === r; });
    if (n) tiles.push({ num: n, lbl: r + ' 지역' });
  });
  document.getElementById('statTiles').innerHTML = tiles.map(function (t) {
    return '<div class="stat-tile"><div class="num">' + t.num + '</div><div class="lbl">' + t.lbl + '</div></div>';
  }).join('');

  /* ---------- 운영상태 분포 ---------- */
  var STATUS_ORDER = ['운영중', '운영예정', '2026 확인', '전년도 확인', '재확인 필요', '기타 확인', '중단'];
  var statusCounts = {};
  FACILITIES.forEach(function (f) {
    statusCounts[f.status] = (statusCounts[f.status] || 0) + 1;
  });
  document.getElementById('statusChips').innerHTML = STATUS_ORDER
    .filter(function (s) { return statusCounts[s]; })
    .map(function (s) {
      return '<span class="status-chip"><span class="tag ' + statusClass(s) + '">' + esc(s) + '</span>' +
        '<span class="chip-num">' + statusCounts[s] + '곳</span></span>';
    }).join('');

  /* ---------- 자치구별 막대 차트 ---------- */
  var byDistrict = {};
  FACILITIES.forEach(function (f) {
    (byDistrict[f.district] = byDistrict[f.district] || []).push(f);
  });
  var entries = Object.keys(byDistrict).map(function (d) { return [d, byDistrict[d].length]; });
  entries.sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0], 'ko'); });
  var max = entries.length ? entries[0][1] : 1;
  document.getElementById('districtBars').innerHTML = entries.map(function (e) {
    return (
      '<button class="dbar" data-district="' + esc(e[0]) + '" title="지도에서 ' + esc(e[0]) + ' 보기">' +
        '<span>' + esc(e[0]) + '</span>' +
        '<span class="track"><span class="fill" style="width:' + (e[1] / max * 100) + '%; background:' + districtColor(e[0]) + '"></span></span>' +
        '<span class="cnt">' + e[1] + '</span>' +
      '</button>'
    );
  }).join('');

  document.getElementById('districtBars').addEventListener('click', function (e) {
    var dbar = e.target.closest('.dbar');
    if (dbar) {
      location.href = 'index.html?district=' + encodeURIComponent(dbar.getAttribute('data-district'));
    }
  });

  /* ---------- 자치구별 상세 표 ---------- */
  var tbody = document.querySelector('#reportTable tbody');
  tbody.innerHTML = entries.map(function (e) {
    var d = e[0], list = byDistrict[d];
    return (
      '<tr>' +
        '<td><span class="legend-dot" style="background:' + districtColor(d) + '"></span>' + esc(d) + '</td>' +
        '<td>' + list.length + '</td>' +
        '<td>' + count(list, function (f) { return f.status === '운영중'; }) + '</td>' +
        '<td>' + count(list, function (f) { return f.status === '2026 확인'; }) + '</td>' +
        '<td>' + count(list, function (f) { return f.status === '운영예정'; }) + '</td>' +
        '<td>' + count(list, function (f) { return f.isFree === true; }) + '</td>' +
      '</tr>'
    );
  }).join('');

  /* ---------- 헤더 ---------- */
  document.getElementById('totalCount').textContent = FACILITIES.length;
  document.getElementById('surveyDate').textContent = DATA_META.surveyDate || '';

  // PWA: 서비스 워커 등록 (홈 화면 설치 · 오프라인 지원)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('서비스 워커 등록 실패:', err);
      });
    });
  }
})();
