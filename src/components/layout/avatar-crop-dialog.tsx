"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogActionsBar,
} from "@/components/ui/dialog";

interface Props {
  src: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (dataUrl: string) => void;
}

const SIZE = 256;

type Pt = { x: number; y: number };

export default function AvatarCropDialog({ src, open, onOpenChange, onConfirm }: Props) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Pt>({ x: 0, y: 0 });
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });

  // 포인터 추적: 1개면 드래그, 2개면 핀치 줌
  const pointers = useRef<Map<number, Pt>>(new Map());
  const dragStart = useRef<{ x: number; y: number; offX: number; offY: number } | null>(null);
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);

  useEffect(() => {
    if (!open || !src) return;
    const img = new Image();
    img.onload = () => {
      setImgDims({ w: img.width, h: img.height });
      // 초기 스케일: 원형 뷰포트를 완전히 덮는 cover 스케일
      const s = Math.max(SIZE / img.width, SIZE / img.height);
      setScale(s);
      setOffset({ x: 0, y: 0 });
    };
    img.src = src;
  }, [src, open]);

  const pointerPositions = (): Pt[] => Array.from(pointers.current.values());

  const distance = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = pointerPositions();
    if (pts.length === 1) {
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        offX: offset.x,
        offY: offset.y,
      };
      pinchStart.current = null;
    } else if (pts.length === 2) {
      pinchStart.current = { dist: distance(pts[0], pts[1]), scale };
      dragStart.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = pointerPositions();

    if (pts.length >= 2 && pinchStart.current) {
      const d = distance(pts[0], pts[1]);
      const nextScale = Math.max(0.1, Math.min(5, pinchStart.current.scale * (d / pinchStart.current.dist)));
      setScale(nextScale);
      return;
    }
    if (pts.length === 1 && dragStart.current) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setOffset({
        x: dragStart.current.offX + dx,
        y: dragStart.current.offY + dy,
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    const pts = pointerPositions();
    if (pts.length < 2) pinchStart.current = null;
    if (pts.length === 0) dragStart.current = null;
    else if (pts.length === 1) {
      // 두 손가락에서 한 손가락으로 전환되면 드래그 재시작
      const [p] = pts;
      dragStart.current = { x: p.x, y: p.y, offX: offset.x, offY: offset.y };
    }
  };

  // 데스크톱: 마우스 휠로도 zoom 가능
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.95 : 1.05;
    setScale((s) => Math.max(0.1, Math.min(5, s * delta)));
  };

  const handleConfirm = () => {
    if (!src) return;
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const displayW = imgDims.w * scale;
    const displayH = imgDims.h * scale;
    const imgLeft = SIZE / 2 - displayW / 2 + offset.x;
    const imgTop = SIZE / 2 - displayH / 2 + offset.y;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, imgLeft, imgTop, displayW, displayH);
      onConfirm(canvas.toDataURL("image/jpeg", 0.9));
      onOpenChange(false);
    };
    img.src = src;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showBackButton={false}
        className="sm:max-w-sm p-0 gap-0 overflow-hidden"
      >
        <div className="px-5 pt-5 pb-4 flex flex-col gap-3 items-center">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">프로필 이미지 편집</DialogTitle>
        </DialogHeader>
          {/* 디바이스별로 다른 인터랙션 안내 — 모바일/데스크탑 사용자 모두 즉시 인지. */}
          <p className="text-xs text-muted-foreground text-center break-keep leading-relaxed">
            <span className="md:hidden">
              한 손가락으로 이동 · 두 손가락으로 확대/축소
            </span>
            <span className="hidden md:inline">
              드래그로 이동 · 마우스 휠로 확대/축소
            </span>
          </p>
          <div
            className="relative rounded-full overflow-hidden bg-muted ring-2 ring-border cursor-grab active:cursor-grabbing select-none"
            style={{ width: SIZE, height: SIZE, touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            {src && imgDims.w > 0 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt="crop"
                draggable={false}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-w-none select-none pointer-events-none"
                style={{
                  width: imgDims.w * scale,
                  height: imgDims.h * scale,
                  marginLeft: offset.x,
                  marginTop: offset.y,
                }}
              />
            )}
          </div>
        </div>
        <DialogActionsBar
          onCancel={() => onOpenChange(false)}
          onConfirm={handleConfirm}
          confirmLabel="등록"
        />
      </DialogContent>
    </Dialog>
  );
}
