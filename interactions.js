/* 互动数据模块 · 点赞 / 收藏 / 评论的唯一数据出入口
   这一刀只用 localStorage 记本机状态，不发任何网络请求。
   将来接后端时【只改这一个文件】：把下面的读写函数换成 fetch 调用，页面代码一行不用动。

   预留的 API 形状（后端接上时按这个来）：
     GET  /api/interactions
       -> { "like_counts": {qid: n}, "fav_counts": {qid: n},
            "my_likes": [qid], "my_favorites": [qid] }
     POST /api/interactions/like      {question_id: string} -> {liked: bool, count: n}
     POST /api/interactions/favorite  {question_id: string} -> {favorited: bool, count: n}

   ⚠️ 评论**不在这个文件里**。2026-09-18 P2-a 之后，评论有了自己的真后端，
   走 rj-api.js / comments.js，形状跟这里原来预留的那条完全不同：

     GET  /api/comments?target=kanread:<精读卡 id>&limit=20&cursor=<ms>
       -> { ok, target, comments_enabled, count, next_cursor,
            items: [{ id, target, body, state, instruction_like, posted_via, posted_on, mine,
                      author: { handle, kind, kind_self_declared, verified_by_site } }] }
     POST   /api/comments                    {target, body}
     DELETE /api/comments/<id>               作者自删（真删，正文清空）
     POST   /api/comments/<id>/report        {reason, note?}

   原来那条 `GET /api/comments?question_id=<qid> -> [{author, body, created_at}]` 已作废：
   它只认 question_id（接不上刊读和脉搏）、没有评论 id、没有身份标签、没有状态、没有分页。
   别照着它再写一套。点赞和收藏这一期仍然是纯本机 localStorage，没动。
*/
window.RJ_INTERACTIONS = (function () {
  "use strict";
  const KEY_LIKES = "rj.likes.v1";
  const KEY_FAVS  = "rj.favorites.v1";

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; }
    catch (e) { return {}; }
  }
  function write(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }
  function toggle(key, qid) {
    const o = read(key);
    if (o[qid]) { delete o[qid]; } else { o[qid] = 1; }
    write(key, o);
    return !!o[qid];
  }

  return {
    /* 点赞 */
    isLiked(qid)     { return !!read(KEY_LIKES)[qid]; },
    toggleLike(qid)  { return toggle(KEY_LIKES, qid); },
    /* 本地态计数只有本机这一票；接后端后改为返回服务端 like_counts[qid] */
    likeCount(qid)   { return this.isLiked(qid) ? 1 : 0; },

    /* 收藏 */
    isFavorite(qid)      { return !!read(KEY_FAVS)[qid]; },
    toggleFavorite(qid)  { return toggle(KEY_FAVS, qid); },
    favoriteCount(qid)   { return this.isFavorite(qid) ? 1 : 0; },
    favoriteIds()        { return Object.keys(read(KEY_FAVS)); }
  };
})();
