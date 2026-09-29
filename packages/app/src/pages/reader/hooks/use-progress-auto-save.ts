import { getBookStatus, updateBookStatus } from "@/services/book-service";
import { throttle } from "@/utils/throttle";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useReaderStore } from "../components/reader-provider";

/**
 * 自动保存阅读进度。
 * 以前每翻一页会同时发出两次保存（上一页的「收尾保存」和这一页的保存），两次都是异步的，
 * 旧的那次如果后完成，就把进度写回了上一页；跳得远（目录、定位原文）时尤其明显。
 * 现在：保存时读最新位置，保存按顺序一个接一个执行，关书 / 切走时再补存一次。
 */
export const useProgressAutoSave = (bookId: string) => {
  const progress = useReaderStore((state) => state.progress);
  const location = useReaderStore((state) => state.location);
  const latest = useRef<{ progress: typeof progress; location: string | null }>({ progress, location });
  latest.current = { progress, location };
  const chain = useRef<Promise<void>>(Promise.resolve());

  const save = useCallback(() => {
    const { progress: currentProgress, location: currentLocation } = latest.current;
    if (!currentProgress || !currentProgress.pageinfo || !currentLocation) return;
    const progressCurrent = currentProgress.pageinfo.current;
    const progressTotal = currentProgress.pageinfo.total;
    chain.current = chain.current
      .then(async () => {
        const now = Date.now();
        const currentStatus = await getBookStatus(bookId);

        let newStatus: "unread" | "reading" | "completed" = "reading";
        if (progressCurrent >= progressTotal) {
          newStatus = "completed";
        } else if (progressCurrent > 0) {
          newStatus = "reading";
        }

        const updateData: Parameters<typeof updateBookStatus>[1] = {
          status: newStatus,
          progressCurrent,
          progressTotal,
          location: currentLocation,
          lastReadAt: now,
        };
        if (!currentStatus?.startedAt && progressCurrent > 0) {
          updateData.startedAt = now;
        }
        if (newStatus === "completed" && !currentStatus?.completedAt) {
          updateData.completedAt = now;
        }
        await updateBookStatus(bookId, updateData);
      })
      .catch((error) => {
        console.error("Failed to update book progress:", error);
      });
  }, [bookId]);

  // 翻页时先存一次，连续翻页时最多每 1.5 秒存一次，停下后再补存最后的位置
  const throttledSave = useMemo(() => throttle(() => save(), 1500), [save]);

  useEffect(() => {
    if (progress && location) throttledSave();
  }, [progress, location, throttledSave]);

  // 关书、切换书、阅读器重建：补存一次最新位置
  useEffect(() => () => save(), [save]);
};
