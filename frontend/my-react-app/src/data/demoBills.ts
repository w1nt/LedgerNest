import type { Bill } from "../types/billing";

/** 仅由显式的「体验演示」入口读取；每个字段都与 Bill.java 对齐。 */
export function createDemoBills(): Bill[] {
  const now = new Date();
  const at = (offset: number, day: number) =>
    new Date(now.getFullYear(), now.getMonth() + offset, day, 12).toISOString();
  const rows: Array<[string, string, string, Bill["settlementStatus"], number, number]> =
    [
      ["Netflix", "15.49", "影视订阅", "completed", 0, 2],
      ["Whole Foods", "85.60", "日常采购", "completed", 0, 4],
      [
        "电费",
        "59.99",
        "家庭日常开销",
        "unpaid",
        0,
        Math.min(now.getDate() + 3, 28),
      ],
      [
        "网络服务",
        "68.00",
        "家庭宽带月费",
        "unpaid",
        0,
        Math.min(now.getDate() + 6, 28),
      ],
      ["房租", "1280.00", "每月住房开销", "completed", 0, 1],
      ["手机话费", "24.00", "手机套餐", "unpaid", -1, 24],
      ["Spotify", "10.99", "音乐订阅", "completed", 0, 3],
      ["Apple iCloud", "2.99", "云存储订阅", "unpaid", 0, 28],
      ["房租", "1280.00", "每月住房开销", "completed", -1, 1],
      ["日常采购", "146.20", "食品与生活用品", "completed", -1, 18],
      ["电费", "59.99", "家庭日常开销", "completed", -1, 12],
      ["房租", "1280.00", "每月住房开销", "completed", -2, 1],
      ["日常采购", "172.30", "食品与生活用品", "completed", -2, 18],
      ["房租", "1280.00", "每月住房开销", "completed", -3, 1],
      ["日常采购", "97.80", "食品与生活用品", "completed", -3, 18],
      ["房租", "1280.00", "每月住房开销", "completed", -4, 1],
      ["日常采购", "215.10", "食品与生活用品", "completed", -4, 18],
      ["房租", "1280.00", "每月住房开销", "completed", -5, 1],
      ["日常采购", "113.60", "食品与生活用品", "completed", -5, 18],
    ];
  return rows.map(
    ([vendorName, amount, comment, status, offset, day], index) => ({
      id: index + 1,
      vendorName,
      amount,
      comment,
      settlementStatus: status,
      settlementVersion: 0,
      confirmedAmount: status === "completed" ? amount : "0.00",
      processingAmount: "0.00",
      remainingAmount: status === "completed" ? "0.00" : amount,
      overpaidAmount: "0.00",
      createdAt: new Date(
        Math.min(
          Date.parse(at(offset, Math.max(1, day - 4))),
          now.getTime() - index * 3600000,
        ),
      ).toISOString(),
      dueAt: at(offset, day),
    }),
  );
}
