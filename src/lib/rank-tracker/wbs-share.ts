// クライアント共有用WBSビューの定義。
// pj（tasks.js のプロジェクトキー）→ 閲覧を許可するサイトドメインの対応表。
// ここに載せたプロジェクトだけ /rank-tracker/wbs/[pj] で共有でき、
// domain は members.allowed_domains の ACL（targetKey 正規化後）と照合される。
export const WBS_SHARED_PROJECTS: Record<
  string,
  { domain: string; heading: string; intro: string }
> = {
  "cin-cia": {
    domain: "cin-cia.com",
    heading: "施策スケジュール（Cin-Cia Nail Academy様）",
    intro: "SEO施策の予定と進捗を一覧できるスケジュールボードです。タスクをクリックすると詳細をご覧いただけます。",
  },
};
