"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * D-day 다이얼로그 — 사용자가 제공한 HTML/CSS/JS 를 iframe srcDoc 으로 그대로
 * 렌더. 외부 도메인이 아니라 데이터 URL 동급이라 X-Frame 차단 무관.
 *
 * 외부 apption 임베드가 X-Frame-Options 으로 막혀서, 사용자 디자인을 직접 인라인.
 * HTML 수정은 아래 IFRAME_HTML 상수만 갈아끼우면 됨.
 */
const IFRAME_HTML = `<!DOCTYPE html>
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
      /* iframe 전체 영역 안에서 타이머를 가로/세로 가운데 배치. */
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
      /* #timer 안의 마지막 자식으로 들어가 align-self 로 우측 정렬 — 그러면
         자동으로 두 번째 행(분/초)의 오른쪽 끝(초 박스 우측)에 맞춰짐.
         #timer 의 letter-spacing/text-transform 은 reset (원본 외부 배치 동작). */
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
      <div class="days">
        <div id="days" class="numbers"></div>일
      </div>
      <div class="hours">
        <div id="hours" class="numbers"></div>시간
      </div>
    </div>
    <div class="row">
      <div class="minutes">
        <div id="minutes" class="numbers"></div>분
      </div>
      <div class="seconds">
        <div id="seconds" class="numbers"></div>초
      </div>
    </div>
    <div class="anniversary-label">
      ❤ 2025. 03. 03. 07:24 ~
    </div>
  </div>

  <script>
    const myDate = new Date('Mar 3, 2025 07:25:00');

    setInterval(function () {
      const today = new Date().getTime();
      const diff = today - myDate;

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      document.getElementById("days").innerText = days;
      document.getElementById("hours").innerText = hours;
      document.getElementById("minutes").innerText = minutes;
      document.getElementById("seconds").innerText = seconds;
    }, 1000);
  </script>
</body>
</html>`;

export default function DdayDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showBackButton={false}
        className="max-w-[calc(100%-1.5rem)] sm:max-w-[400px] p-0 gap-0 overflow-hidden bg-white border-[10px] border-gray-600"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>D-day</DialogTitle>
        </DialogHeader>
        {/* 다이얼로그 열린 동안만 마운트해(open && ...) iframe 의 setInterval 도
            닫으면 자동 정리. sandbox="allow-scripts" — fonts.googleapis 만 허용,
            same-origin 차단해 내부에서 부모 DOM 못 만지게. */}
        {open && (
          <iframe
            srcDoc={IFRAME_HTML}
            title="D-day"
            sandbox="allow-scripts"
            className="block w-full h-[380px] sm:h-[370px] border-0 bg-white"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
