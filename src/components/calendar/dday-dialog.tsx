"use client";

import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * D-day 다이얼로그 — 사용자가 입력한 기념일(date+time)부터 경과 시간을 1초 단위로
 * 표시. 디자인은 srcDoc HTML/CSS/JS 그대로, date 만 동적 주입.
 *
 * 외부 임베드(apption)는 X-Frame 차단으로 폐기. 자체 srcDoc 인라인이라 차단 무관.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "YYYY-MM-DD" — 비어있으면 다이얼로그가 빈 상태로 뜸 (caller 가 가드해야 함). */
  date: string;
  /** "HH:MM" 24h */
  time: string;
}

/** 입력 date+time 으로 IFRAME 의 HTML 문자열 생성. */
function buildIframeHtml(date: string, time: string): string {
  // myDate JS 파싱용 ISO. iOS Safari 도 안전하게 파싱하는 형식.
  const isoLike = `${date}T${time}:00`;
  // 라벨용 한글 형식 — "YYYY. MM. DD. HH:MM"
  const [y, m, d] = date.split("-");
  const labelDate = `${y}. ${m}. ${d}. ${time}`;
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css?family=Lato:400,700|Montserrat:900" rel="stylesheet">
  <style>
    html, body { height: 100%; }
    body {
      margin: 0;
      background-color: white;
      font-family: 'Montserrat', sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    #timer {
      color: #eeeeee;
      text-transform: uppercase;
      font-size: 1em;
      letter-spacing: 5px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    .anniversary-label {
      align-self: flex-end;
      margin-top: 6px;
      letter-spacing: normal;
      text-transform: none;
      font-family: 'Noto Sans KR', sans-serif;
      font-size: 1em;
      font-weight: 500;
      color: #444;
      background-color: rgba(255, 255, 255, 0.8);
      padding: 5px 10px;
      border-radius: 10px;
    }
    .row {
      display: flex;
      justify-content: center;
      gap: 10px;
    }
    .days, .hours, .minutes, .seconds {
      padding: 14px;
      width: 100px;
      height: 100px;
      box-sizing: content-box;
      border-radius: 5px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }
    .days { background: #EF2F3C; }
    .hours { background: #eeeeee; color: #183059; }
    .minutes { background: #276FBF; }
    .seconds { background: #F0A202; }
    .numbers {
      font-family: 'Montserrat', sans-serif;
      color: #183059;
      font-size: 2.7em;
      text-align: center;
    }
  </style>
</head>
<body>
  <div id="timer">
    <div class="row">
      <div class="days"><div id="days" class="numbers"></div>일</div>
      <div class="hours"><div id="hours" class="numbers"></div>시간</div>
    </div>
    <div class="row">
      <div class="minutes"><div id="minutes" class="numbers"></div>분</div>
      <div class="seconds"><div id="seconds" class="numbers"></div>초</div>
    </div>
    <div class="anniversary-label">❤ ${labelDate} ~</div>
  </div>
  <script>
    const myDate = new Date('${isoLike}');
    function tick() {
      const diff = Date.now() - myDate.getTime();
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      document.getElementById("days").innerText = days;
      document.getElementById("hours").innerText = hours;
      document.getElementById("minutes").innerText = minutes;
      document.getElementById("seconds").innerText = seconds;
    }
    tick();
    setInterval(tick, 1000);
  </script>
</body>
</html>`;
}

export default function DdayDialog({ open, onOpenChange, date, time }: Props) {
  // date/time 이 바뀌면 srcDoc 만 갱신 (iframe 자체는 동일 인스턴스 → 매끄러운 전환).
  const html = useMemo(() => buildIframeHtml(date, time), [date, time]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showBackButton={false}
        className="max-w-[calc(100%-1.5rem)] sm:max-w-[400px] p-0 gap-0 overflow-hidden bg-white"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>D-day</DialogTitle>
        </DialogHeader>
        <iframe
          srcDoc={html}
          title="D-day"
          sandbox="allow-scripts"
          className="block w-full h-[380px] sm:h-[370px] border-0 bg-white"
        />
      </DialogContent>
    </Dialog>
  );
}
