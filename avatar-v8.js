/*
 * 第二人称头像 v8 SVG renderer.
 * Faithfully extracted from source/v8-index.html (231774 bytes),
 * SHA-256 ef0fff2dcef5edee4776245d96001bba064509b19c8e9e2441c0dc307f7e3875.
 * The account DTO adapter is v1; preset labels are display-only and never persist as names.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RJ_AVATAR_V8 = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
var INK="#7a4a2e";
  var OUTFIT={
   head:[
    {k:"tophat",zh:"黑礼帽",svg:'<g transform="translate(12 -4) rotate(12 50 18)"><ellipse cx="50" cy="24" rx="21" ry="4.5" fill="#3d3a3a" stroke="'+INK+'" stroke-width="2"/><path d="M37 24L39 5Q50 1 61 5L63 24Z" fill="#4a4646" stroke="'+INK+'" stroke-width="2" stroke-linejoin="round"/><path d="M38.2 17.5Q50 20 61.8 17.5L62.4 21.8Q50 24 37.7 21.8Z" fill="#8f3b35"/></g>'},
    {k:"catears",zh:"猫耳",svg:'<path d="M24 30L27 6L44 21Z" fill="#f7e3d7" stroke="'+INK+'" stroke-width="2" stroke-linejoin="round"/><path d="M29 24L30 13L38 20Z" fill="#f2a7a7"/><path d="M76 30L73 6L56 21Z" fill="#f7e3d7" stroke="'+INK+'" stroke-width="2" stroke-linejoin="round"/><path d="M71 24L70 13L62 20Z" fill="#f2a7a7"/>'},
    {k:"halo",zh:"光环",svg:'<ellipse cx="50" cy="9" rx="19" ry="5.5" fill="none" stroke="#f2c14e" stroke-width="4.5"/><ellipse cx="50" cy="9" rx="19" ry="5.5" fill="none" stroke="'+INK+'" stroke-width="1" opacity=".5"/>'},
    {k:"crown",zh:"小皇冠",svg:'<path d="M33 22L34 6L42 14L50 3L58 14L66 6L67 22Z" fill="#f5c542" stroke="'+INK+'" stroke-width="2" stroke-linejoin="round"/><circle cx="50" cy="15" r="2.6" fill="#d9434f"/><circle cx="40" cy="18" r="1.8" fill="#4d9de0"/><circle cx="60" cy="18" r="1.8" fill="#4d9de0"/>'},
    {k:"bow",zh:"蝴蝶结发箍",svg:'<path d="M22 30Q50 8 78 30" fill="none" stroke="#ef8fa6" stroke-width="4" stroke-linecap="round"/><path d="M62 16L76 8L76 26Z" fill="#f5a3b8" stroke="'+INK+'" stroke-width="2" stroke-linejoin="round"/><path d="M62 16L50 6L52 24Z" fill="#f5a3b8" stroke="'+INK+'" stroke-width="2" stroke-linejoin="round"/><circle cx="62" cy="16" r="3.4" fill="#e0607e" stroke="'+INK+'" stroke-width="1.6"/>'},
    {k:"straw",zh:"草帽",svg:'<ellipse cx="50" cy="22" rx="30" ry="6" fill="#ecca7c" stroke="'+INK+'" stroke-width="2"/><path d="M36 21Q37 5 50 5Q63 5 64 21Z" fill="#f1d58f" stroke="'+INK+'" stroke-width="2"/><path d="M36.5 16Q50 19 63.5 16L64 20Q50 23 36 20Z" fill="#d6453d"/>'},
    {k:"ahoge",zh:"呆毛",svg:'<path d="M50 24C49 14 44 10 40 8C46 8 52 12 53 6C54 12 52 18 50 24Z" fill="#3b2b25" stroke="'+INK+'" stroke-width="1.6" stroke-linejoin="round"/>'},
    {k:"flowers",zh:"花环",svg:'<path d="M24 26Q50 12 76 26" fill="none" stroke="#7fb069" stroke-width="3"/>'+[[26,24,"#f7a6b8"],[38,18,"#fff"],[50,16,"#f7d65c"],[62,18,"#fff"],[74,24,"#f7a6b8"]].map(function(f){return '<g><circle cx="'+f[0]+'" cy="'+f[1]+'" r="5" fill="'+f[2]+'" stroke="'+INK+'" stroke-width="1.5"/><circle cx="'+f[0]+'" cy="'+f[1]+'" r="1.6" fill="#e8a33d"/></g>'}).join("")}
   ],
   neck:[
    {k:"collar",zh:"衬衫领",svg:'<path d="M30 86L50 91L45 99L27 95Z" fill="#fff" stroke="'+INK+'" stroke-width="2" stroke-linejoin="round"/><path d="M70 86L50 91L55 99L73 95Z" fill="#fff" stroke="'+INK+'" stroke-width="2" stroke-linejoin="round"/><circle cx="50" cy="95" r="2.2" fill="#e8a33d" stroke="'+INK+'" stroke-width="1"/>'},
    {k:"bowtie",zh:"领结",svg:'<path d="M50 90L35 83L35 97Z" fill="#c0392b" stroke="'+INK+'" stroke-width="2" stroke-linejoin="round"/><path d="M50 90L65 83L65 97Z" fill="#c0392b" stroke="'+INK+'" stroke-width="2" stroke-linejoin="round"/><rect x="46" y="86.5" width="8" height="7" rx="2" fill="#a52f23" stroke="'+INK+'" stroke-width="1.6"/>'},
    {k:"scarf",zh:"围巾",svg:'<path d="M24 84Q50 94 76 84L77 91Q50 101 23 91Z" fill="#e0584b" stroke="'+INK+'" stroke-width="2" stroke-linejoin="round"/><path d="M60 92L66 99L58 100L55 93Z" fill="#e0584b" stroke="'+INK+'" stroke-width="2" stroke-linejoin="round"/><path d="M34 88L35 95M44 90L44 97" stroke="#f3e2c7" stroke-width="2"/>'},
    {k:"bell",zh:"铃铛项圈",svg:'<path d="M26 84Q50 93 74 84" fill="none" stroke="#d94f4f" stroke-width="5" stroke-linecap="round"/><circle cx="50" cy="93" r="5" fill="#f5c542" stroke="'+INK+'" stroke-width="1.8"/><path d="M47 94H53" stroke="'+INK+'" stroke-width="1.4"/>'},
    {k:"pearls",zh:"珍珠项链",svg:[26,32,38,44,50,56,62,68,74].map(function(x,i){var y=84+Math.sin(i/8*Math.PI)*8;return '<circle cx="'+x+'" cy="'+y.toFixed(1)+'" r="3.2" fill="#fbf6ee" stroke="'+INK+'" stroke-width="1.3"/>'}).join("")},
    {k:"tie",zh:"领带",svg:'<path d="M46 85H54L52.5 90H47.5Z" fill="#3d5a99" stroke="'+INK+'" stroke-width="1.8" stroke-linejoin="round"/><path d="M47.5 90H52.5L56 100H44Z" fill="#4a6bb3" stroke="'+INK+'" stroke-width="1.8" stroke-linejoin="round"/>'},
    {k:"bandana",zh:"小方巾",svg:'<path d="M28 84Q50 90 72 84L50 100Z" fill="#f2a93b" stroke="'+INK+'" stroke-width="2" stroke-linejoin="round"/><circle cx="44" cy="90" r="1.3" fill="#fff"/><circle cx="54" cy="92" r="1.3" fill="#fff"/><circle cx="50" cy="96" r="1.1" fill="#fff"/>'}
   ],
   face:[
    {k:"monocle",zh:"单片镜",svg:'<circle cx="60" cy="49" r="11" fill="rgba(255,253,240,.82)" stroke="#d8a63a" stroke-width="3.4"/><circle cx="60" cy="49" r="11" fill="none" stroke="'+INK+'" stroke-width="1"/><path d="M68 57Q70 66 66 74" fill="none" stroke="#d8a63a" stroke-width="1.8" stroke-dasharray="2 2"/>'},
    {k:"shades",zh:"墨镜",svg:'<path d="M28 45H47L45 55Q37 59 30 55Z" fill="#1d1d1f" stroke="'+INK+'" stroke-width="1.8" stroke-linejoin="round"/><path d="M53 45H72L70 55Q63 59 55 55Z" fill="#1d1d1f" stroke="'+INK+'" stroke-width="1.8" stroke-linejoin="round"/><path d="M47 47H53" stroke="'+INK+'" stroke-width="2"/><path d="M32 47L36 47" stroke="#fff" stroke-width="1.5" opacity=".7"/>'},
    {k:"round",zh:"圆框眼镜",svg:'<circle cx="39" cy="50" r="8.5" fill="rgba(255,255,255,.55)" stroke="'+INK+'" stroke-width="2.2"/><circle cx="61" cy="50" r="8.5" fill="rgba(255,255,255,.55)" stroke="'+INK+'" stroke-width="2.2"/><path d="M47.5 49Q50 47 52.5 49" fill="none" stroke="'+INK+'" stroke-width="2"/>'},
    {k:"blush",zh:"腮红脸",svg:'<circle cx="41" cy="48" r="2.6" fill="'+INK+'"/><circle cx="59" cy="48" r="2.6" fill="'+INK+'"/><ellipse cx="35" cy="56" rx="5" ry="3" fill="#f39aa6" opacity=".85"/><ellipse cx="65" cy="56" rx="5" ry="3" fill="#f39aa6" opacity=".85"/><path d="M46 55Q50 59 54 55" fill="none" stroke="'+INK+'" stroke-width="2" stroke-linecap="round"/>'},
    {k:"stache",zh:"小胡子",svg:'<path d="M50 58C46 53 38 54 34 58C38 57 41 61 46 60C48 60 49 59 50 58C51 59 52 60 54 60C59 61 62 57 66 58C62 54 54 53 50 58Z" fill="#3b2b25"/>'},
    {k:"catmouth",zh:"猫猫嘴",svg:'<circle cx="41" cy="47" r="2.6" fill="'+INK+'"/><circle cx="59" cy="47" r="2.6" fill="'+INK+'"/><path d="M43 56Q46.5 60 50 56Q53.5 60 57 56" fill="none" stroke="'+INK+'" stroke-width="2" stroke-linecap="round"/>'},
    {k:"patch",zh:"眼罩",svg:'<path d="M24 42L76 50" stroke="'+INK+'" stroke-width="1.6"/><ellipse cx="60" cy="50" rx="8" ry="6.5" fill="#1d1d1f" stroke="'+INK+'" stroke-width="1.6"/><circle cx="40" cy="48" r="2.6" fill="'+INK+'"/>'},
    {k:"hearts",zh:"爱心眼",svg:[40,60].map(function(x){return '<path d="M'+x+' 54C'+(x-9)+' 48 '+(x-6)+' 41 '+x+' 45C'+(x+6)+' 41 '+(x+9)+' 48 '+x+' 54Z" fill="#e8445a" stroke="'+INK+'" stroke-width="1.5" stroke-linejoin="round"/>'}).join("")}
   ]
  };
  var SLOTS=[["head","头顶"],["face","脸"],["neck","脖子"]];
OUTFIT.head.push({k:"leaf",zh:"小叶子",svg:'<path d="M50 21C50 17 50.5 14.5 52 12.5" fill="none" stroke="#6b8f47" stroke-width="1.8" stroke-linecap="round"/><path d="M52 12.5C55 5.5 62.5 4 66 6C64 11.5 57.5 14.5 52 12.5Z" fill="#8fc26a" stroke="'+INK+'" stroke-width="1.6" stroke-linejoin="round"/><path d="M53.5 11.6C57 9.4 60.6 7.8 63.6 7" fill="none" stroke="#d6efbf" stroke-width="1.1" stroke-linecap="round"/>'},
 {k:"flower",zh:"小花",svg:[[0,-4.4],[4.2,-1.4],[2.6,3.6],[-2.6,3.6],[-4.2,-1.4]].map(function(q){return '<circle cx="'+(66+q[0])+'" cy="'+(21+q[1])+'" r="3.4" fill="#f7a6b8" stroke="'+INK+'" stroke-width="1.3"/>'}).join("")+'<circle cx="66" cy="21" r="2.4" fill="#f7d65c" stroke="'+INK+'" stroke-width="1.1"/><circle cx="65.2" cy="20.2" r=".8" fill="#fff"/>'});
function outfit(slot,k){return (OUTFIT[slot]||[]).filter(function(o){return o.k===k})[0]}

/* ---------- color ---------- */
function hx(c){c=c.replace("#","");return [0,2,4].map(function(i){return parseInt(c.substr(i,2),16)})}
function toHex(a){return "#"+a.map(function(v){v=Math.max(0,Math.min(255,Math.round(v)));return (v<16?"0":"")+v.toString(16)}).join("")}
function mix(a,b,t){var x=hx(a),y=hx(b);return toHex(x.map(function(v,i){return v+(y[i]-v)*t}))}
function lum(c){var x=hx(c);return (0.299*x[0]+0.587*x[1]+0.114*x[2])/255}
var DEEP="#4a2a1a",WARM="#6b3d24",PATCH="#3d3538";

/* ---------- palettes ---------- */
var FUR=[["#e8843f","焦糖橘"],["#f3e1c0","奶油泡芙"],["#a9a6ab","雾灰团子"],["#8a5a3c","可可豆"],["#fbf4ea","雪团白"],["#4d4449","芝麻黑"],["#efb2a9","樱花粉"],["#8e9fb4","月光蓝灰"],["#d9a55e","蜂蜜吐司"]];
var SKIN=[["#fde7d8","牛奶"],["#f8d2b6","蜜桃"],["#eab993","小麦"],["#c98c60","焦糖"],["#94613f","可可"],["#6b452f","黑巧"]];
var HAIRC=[["#3a2a26","墨团"],["#6b4330","栗子"],["#b9773f","焦糖"],["#e2c07a","奶茶金"],["#c9575a","莓果"],["#8b7bc0","雾紫"]];
var SQUIDC=[["#4b4e9a","深海蓝紫"],["#6a5aa8","暮光紫"],["#3a6f8f","夜海青"],["#c97a8e","珊瑚粉"],["#8a86c8","薰衣草"],["#5d5a73","墨鱼灰"]];
var SQFACE=[["skin","浅肤色"],["lilac","淡紫"]];
var JELLYC=[["#e3a6d8","粉紫"],["#9fc3ea","月光蓝"],["#f6eee4","奶白"]];
var EYEC=[["#c8861f","琥珀"],["#7a4a2c","栗棕"],["#3f8fc4","湖蓝"],["#4f9a74","薄荷"],["#8d5fb8","葡萄"],["#e0a92c","蜂蜜"]];
var SPECIES=[["squid","乌贼"],["jelly","水母"],["fox","狐狸"],["cat","猫"],["bunny","兔"],["bear","熊"],["wolf","狼"],["hamster","仓鼠"],["squirrel","松鼠"],["deer","小鹿"],["sheep","绵羊"],["panda","熊猫"],["raccoon","浣熊"],["shiba","柴犬"],["tiger","小老虎"],["koala","考拉"],["penguin","企鹅"],["octopus","小章鱼"],["dumbo","小飞象章鱼"],["tit","银喉长尾山雀"],["capy","水豚"],["frog","青蛙"],["hedgehog","刺猬"],["otter","海獭"],["axolotl","六角恐龙"],["seal","海豹宝宝"],["redpanda","小熊猫"],["alpaca","羊驼"],["bat","小蝙蝠"],["human","人"]];
var HAIRS=[["long","长直发"],["curly","短卷"],["short","呆毛短发"],["twin","双马尾"],["bun","丸子头"],["wolfcut","狼尾"],["braid","编辫子"],["beanie","光头戴帽"]];
var FACES=[["round","圆脸"],["puffy","鼓腮"],["slim","瓜子"],["chubby","团子"]];
var FACET={round:[1,1],puffy:[1.06,.97],slim:[.94,1.03],chubby:[1.1,1.02]};
var EYES=[["glass","玻璃珠"],["starry","星星"],["watery","水汪汪"],["bead","豆豆"],["almond","杏仁"]];
var EXPR=[["default","默认"],["closed","闭眼"],["happy","开心"],["wow","惊讶"]];
var BROWSTY=[["none","无"],["thin","细"],["normal","普通"],["chubby","团子"]];
/* universal expression table: eye state x brow angle x mouth x symbol x motion */
var EXP={
 neutral:{zh:"默认",eye:"open",brow:"soft",mouth:null,sym:"",mot:""},
 happy:{zh:"开心",eye:"smile",brow:"soft",mouth:"grin",sym:"",mot:"",blush:1},
 celebrate:{zh:"庆祝",eye:"sparkle",brow:"up",mouth:"haa",sym:"confetti",mot:"hop",blush:1},
 shy:{zh:"害羞",eye:"closed",brow:"worried",mouth:"wavy",sym:"steam",mot:"",blush:2},
 cry:{zh:"哭泣",eye:"closed",brow:"worried",mouth:"frown",sym:"cry",mot:""},
 think:{zh:"思索",eye:"lookup",brow:"smug",mouth:"flat",sym:"think",mot:""},
 afraid:{zh:"害怕",eye:"wide",brow:"worried",mouth:"wavy",sym:"sweat",mot:"shiver"},
 angry:{zh:"生气",eye:"glare",brow:"angry",mouth:"frown",sym:"angry",mot:""},
 wave:{zh:"打招呼",eye:"smile",brow:"soft",mouth:"grin",sym:"wave",mot:""},
 nod:{zh:"点头",eye:"smile",brow:"soft",mouth:"smile",sym:"",mot:"nod"},
 shake:{zh:"摇头",eye:"closed",brow:"flat",mouth:"flat",sym:"",mot:"shake"},
 bow:{zh:"鞠躬",eye:"closed",brow:"soft",mouth:"smile",sym:"",mot:"bow"},
 sleepy:{zh:"困/慵懒",eye:"half",brow:"sleepy",mouth:"smallo",sym:"zzz",mot:""},
 surprised:{zh:"惊讶",eye:"wide",brow:"up",mouth:"o",sym:"exclaim",mot:""},
 smug:{zh:"得意",eye:"half",brow:"smug",mouth:"smirk",sym:"sparkle",mot:""},
 moved:{zh:"感动",eye:"teary",brow:"worried",mouth:"smile",sym:"",mot:"",blush:1},
 speechless:{zh:"无语",eye:"half",brow:"flat",mouth:"flat",sym:"dots",mot:""},
 daze:{zh:"放空冒泡",eye:"open",brow:"flat",mouth:"smallo",sym:"daze",mot:""}
};
var EXPK=Object.keys(EXP);var EXPL=EXPK.map(function(k){return [k,EXP[k].zh]});
var STATES=[["open","睁"],["half","半闭耷拉"],["smile","弯月笑"],["closed","闭"],["teary","含泪"],["sparkle","星光"],["wide","睁大"]];
function ex(p){return EXP[p.ex||"neutral"]||EXP.neutral}
var MOUTHS=[["omega","ω"],["smile","抿笑"],["grin","咧嘴笑"],["fang","小獠牙"],["teeth","小门牙"],["blep","吐舌"],["pout","嘟嘴"],["grass","叼草"]];
var STICK=[["star","星星"],["heart","爱心"],["bandaid","创可贴"],["freckles","雀斑"],["mole","泪痣"],["flower","小花"],["glitter","闪粉"],["whisker","猫胡须"],["blushpatch","腮红贴"],["blushstar","星星腮红贴"],["blushflower","花朵腮红贴"]];
var SHADOW=[["none","无"],["pink","粉晕"],["peach","蜜桃"],["purple","紫雾"],["gold","金闪"],["coral","珊瑚"]];
var SHC={pink:"#f59ab5",peach:"#f7a86e",purple:"#b48be0",gold:"#e8c25a",coral:"#f47f6b"};
var IDLE=[["special","专属动作"],["float","呼吸浮动"],["ear","耳朵抖抖"],["calm","只眨眼"]];
var EMOTE=[["none","不挂"],["heart","发送爱心"],["angry","生气"],["nod","点点头"],["shake","摇摇头"],["sweat","冒汗"],["question","问号"],["zzz","Zzz"],["note","哼歌"],["sparkle","亮晶晶"],["steam","害羞冒烟"],["think","思考中"],["idea","灵光一现"],["mail","收到信"],["tear","泪珠"],["cry","感动哭"],["cover","害羞捂脸"],["yawn","打哈欠"],["wave","挥手"],["spin","转圈蹦"],["exclaim","感叹号"],["rainbow","彩虹泡泡"]];
var BLUSH=[["none","不要"],["soft","粉团"],["peach","蜜桃大"],["flat","平涂"],["sticker","贴纸"],["shy","害羞线"]];
var MARKS=[["cheeks","白腮"],["stripes","额纹"],["spots","斑点"]];
var ACCH=[["","不戴"],["tophat","黑礼帽"],["orange","小橘子"],["sprout","小草苗"],["beret","画师贝雷帽"],["bow","蝴蝶结"],["leaf","小叶子"],["flower","小花"],["crown","小皇冠"],["halo","光环"],["catears","猫耳"],["straw","草帽"],["flowers","花环"],["ahoge","呆毛"],["starclip","星星发卡"],["flowerclip","花朵发卡"],["shellclip","贝壳发夹"],["starfish","海星头饰"],["phones","耳机"]];
var ACCF=[["","不戴"],["round","圆框眼镜"],["monocle","单片镜"],["shades","墨镜"],["stache","小胡子"]];
var ACCN=[["","不戴"],["starbow","星点领结"],["cape","木扣小斗篷"],["scarf","红围巾"],["bell","铃铛"],["pearls","珍珠项链"],["bubbles","泡泡项链"],["bowtie","领结"],["collar","衬衫领"],["tie","领带"],["bandana","小方巾"]];
var ACCB=[["","不背"],["angel","天使小翅膀"],["devil","小恶魔翅膀"],["umbrella","雨伞"],["backpack","小书包"],["mailbag","斜挎邮差包"]];

/* ---------- geometry ---------- */
function mx(x){return +(100-x).toFixed(2)}
function sym(start,segs){var d="M"+start[0]+" "+start[1],pts=[start];
 segs.forEach(function(s){d+="C"+s.join(" ");pts.push([s[4],s[5]])});
 for(var i=segs.length-1;i>=0;i--){var s=segs[i],p=pts[i];d+="C"+mx(s[2])+" "+s[3]+" "+mx(s[0])+" "+s[1]+" "+mx(p[0])+" "+p[1]}
 return d+"Z"}
function pair(one,cls,origin,cls2){var st=origin?' style="transform-origin:'+origin+'"':"";
 return '<g class="'+(cls||"")+'"'+st+'>'+one+'</g><g transform="translate(100 0) scale(-1 1)"><g class="'+(cls2||cls||"")+'"'+st+">"+one+"</g></g>"}
function P(d,fill,o){o=o||{};return '<path d="'+d+'" fill="'+fill+'"'+(o.stroke?' stroke="'+o.stroke+'" stroke-width="'+(o.w||2)+'" stroke-linejoin="round" stroke-linecap="round"':"")+(o.op?' opacity="'+o.op+'"':"")+(o.cls?' class="'+o.cls+'"':"")+(o.f?' filter="url(#wob2)"':"")+"/>"}
var L="var(--line)";

/* ---------- species: head, lighter face area, ears, nose, extras, motion ---------- */
var SP={
 fox:{c:"#e8843f",head:sym([50,21],[[67,21,80,29,83,43],[89,44,94,51,89,56],[95,58,93,66,87,67],[90,72,84,77,78,79],[70,86,60,89,50,89]]),
  cheek:sym([50,60],[[56,60,63,64,71,65],[79,65,85,61,89,56],[95,58,93,66,87,67],[90,72,84,77,78,79],[70,86,60,89,50,89]]),nose:"tri",marks:["cheeks"],bang:1,
  ears:function(U){return P("M57 29C63 17 73 7 83 3C87 12 89 26 86 41C79 35 68 30 57 29Z","var(--fur)",{stroke:L})+P("M62 29C67 20 74 13 80 10C83 18 84 28 82 37C77 33 69 30 62 29Z","url(#ep"+U+")")+innerFluff(66,33)+P("M80 7C81.5 5 82.5 3.8 83 3C86 10 88 18 88 22C85 18 82 12 80 7Z","var(--furD)")},eo:"72px 36px"},
 wolf:{c:"#8e9fb4",head:sym([50,20],[[68,20,82,28,85,42],[92,43,97,50,91,55],[98,58,96,66,89,68],[93,73,86,79,80,80],[72,87,61,91,50,91]]),
  cheek:sym([50,58],[[57,58,64,63,72,64],[80,64,86,59,91,55],[98,58,96,66,89,68],[93,73,86,79,80,80],[72,87,61,91,50,91]]),nose:"tri",marks:["cheeks"],bang:1,
  ears:function(U){return P("M59 29C62 17 69 7 77 1C83 10 87 24 85 39C78 34 68 30 59 29Z","var(--fur)",{stroke:L})+P("M63 29C66 20 71 12 76 8C80 16 82 26 81 35C76 32 69 30 63 29Z","url(#ep"+U+")")+innerFluff(66,33)+P("M76 2C75.5 -1 78 -2 79 1C80.5 -.5 82 1.5 80.5 4Z","var(--furD)")},eo:"72px 36px"},
 cat:{c:"#a9a6ab",head:sym([50,23],[[68,23,82,32,84,46],[89,47,92,53,88,57],[92,59,91,66,86,67],[88,72,83,77,78,78],[70,86,60,89,50,89]]),
  muzzle:sym([50,62],[[55,62,59,64,62,66],[64,70,62,75,57,77],[55,79,52,79,50,79]]),nose:"pinktri",marks:["stripes"],whisk:1,
  ears:function(U){return P("M59 29C65 21 74 14 83 11C86 19 87 29 85 40C78 34 68 30 59 29Z","var(--fur)",{stroke:L})+P("M64 29C69 23 75 18 80 16C82 22 83 29 82 36C77 32 70 30 64 29Z","url(#ep"+U+")")+innerFluff(67,33)},eo:"72px 36px"},
 bunny:{c:"#f3e1c0",head:sym([50,24],[[68,24,82,34,83,50],[88,53,90,60,86,64],[90,68,87,76,80,79],[72,87,61,89,50,89]]),
  muzzle:sym([50,62],[[55,62,59,64,61,67],[63,71,60,75,55,76],[53,77,51,77,50,77]]),nose:"dot",marks:[],whisk:1,bang:2,
  ears:function(U){return P("M57 30C53 18 55 3 64 1C73 -1 76 14 72 32Z","var(--fur)",{stroke:L})+P("M60 28C57 18 59 7 64 6C69 5 71 16 69 29Z","url(#ep"+U+")")+innerFluff(61,31,.8)},eo:"65px 32px",motion:"nose"},
 bear:{c:"#8a5a3c",head:sym([50,22],[[70,22,85,34,86,50],[91,52,92,60,87,63],[90,67,86,74,80,76],[72,86,60,89,50,89]]),
  muzzle:sym([50,60],[[58,60,63,64,63,69],[63,75,57,79,50,79]]),nose:"wide",marks:[],
  ears:function(U){return '<circle cx="77" cy="27" r="12" fill="var(--fur)" stroke="var(--line)" stroke-width="2"/><circle cx="77.5" cy="28" r="6.5" fill="url(#ep'+U+')"/>'+innerFluff(73,31,.7)},eo:"77px 36px"},
 hamster:{c:"#e6b06e",head:sym([50,27],[[70,27,84,37,87,51],[93,55,95,66,89,74],[84,82,68,89,50,89]]),
  cheek:sym([50,64],[[58,62,70,58,80,60],[92,63,94,72,88,76],[82,84,66,89,50,89]]),nose:"pinktri",marks:["cheeks"],whisk:1,
  ears:function(U){return '<circle cx="71" cy="27" r="8" fill="var(--fur)" stroke="var(--line)" stroke-width="2"/><circle cx="71.5" cy="28" r="4.3" fill="url(#ep'+U+')"/>'},eo:"71px 33px",motion:"puff"},
 squirrel:{c:"#c7743f",head:sym([50,24],[[68,24,82,33,84,48],[90,50,92,58,87,61],[91,65,88,73,81,77],[72,86,60,89,50,89]]),
  muzzle:sym([50,61],[[56,61,61,64,63,68],[64,73,58,78,50,78]]),nose:"tri",marks:["stripes"],
  ears:function(U){return P("M60 30C60 17 66 7 73 5C79 9 80 21 78 35C72 32 66 30 60 30Z","var(--fur)",{stroke:L})+P("M64 30C64 20 68 13 72 11C75 15 76 23 75 32C71 31 67 30 64 30Z","url(#ep"+U+")")+P("M71 7C69 1 73 -2 75.5 1C78 -1.5 81 1.5 78.5 6.5C76 5 73 5 71 7Z","var(--furD)",{stroke:L,w:1.4})},eo:"70px 36px",motion:"tail"},
 deer:{c:"#c98a55",head:sym([50,25],[[66,25,79,35,80,52],[81,66,72,82,60,87],[56,89,53,90,50,90]]),
  muzzle:sym([50,64],[[56,64,61,68,61,73],[61,80,56,84,50,84]]),nose:"oval",marks:["spots"],
  ears:function(U){return P("M74 42C82 31 94 29 100 33C97 41 87 47 76 47Z","var(--fur)",{stroke:L})+P("M78 43C84 36 92 34 96 35C93 40 86 44 79 45Z","url(#ep"+U+")")+P("M58 27C56.5 20 59 15 62.5 16C65.5 17 65 22 62.5 27.5Z","#dcb27a",{stroke:L,w:1.6})},eo:"76px 45px"},
 sheep:{c:"#fbf4ea",head:sym([50,30],[[64,30,75,40,76,56],[77,72,66,85,50,86]]),face2:1,nose:"y",marks:[],
  ears:function(U){return P("M74 52C83 47 94 48 97 55C91 60 82 60 75 58Z","var(--face)",{stroke:L})+P("M78 53C84 51 90 52 92 55C88 57 83 57 78 56Z","url(#ep"+U+")")},eo:"76px 55px",motion:"wool"},
 panda:{c:"#fbf6ee",head:sym([50,24],[[70,24,86,36,87,54],[88,72,74,88,50,88]]),nose:"wide",marks:[],patch:1,
  ears:function(U){return '<circle cx="77" cy="28" r="11" fill="'+PATCH+'" stroke="var(--line)" stroke-width="2"/><circle cx="75" cy="25" r="3" fill="#fff" opacity=".25"/>'},eo:"77px 36px",motion:"tilt"},
 raccoon:{c:"#9a9a9e",head:sym([50,23],[[68,23,82,31,85,45],[91,47,94,55,88,59],[93,62,91,70,85,71],[86,77,80,82,74,84],[66,88,58,89,50,89]]),
  muzzle:sym([50,63],[[57,63,62,67,62,72],[62,79,56,82,50,82]]),nose:"tri",marks:[],mask:1,
  ears:function(U){return P("M60 29C64 19 72 13 80 12C84 18 84 28 82 38C76 32 68 29 60 29Z","var(--fur)",{stroke:L})+P("M64 29C67 22 72 18 78 17C80 22 80 29 79 35C75 31 69 29 64 29Z","#5a5254")+P("M66 30C69 26 72 24 73 21C74 25 76 27 77.5 25.5C77.5 29 78.5 31 79 33Z","#f4efe8")},eo:"72px 36px"},
 shiba:{c:"#d98a45",head:sym([50,22],[[68,22,82,31,84,46],[88,50,90,58,86,62],[90,66,87,74,80,78],[72,86,61,89,50,89]]),
  cheek:sym([50,58],[[57,58,63,62,70,64],[78,64,84,60,86,62],[90,66,87,74,80,78],[72,86,61,89,50,89]]),nose:"wide",marks:["cheeks"],shibaDots:1,
  ears:function(U){return P("M60 29C64 18 71 11 78 9C82 16 83 26 81 37C75 32 67 29 60 29Z","var(--fur)",{stroke:L})+P("M64 29C67 21 72 16 77 14C79 20 79 27 78 33C74 30 69 29 64 29Z","var(--cream)")},eo:"72px 36px",motion:"tilt"},
 tiger:{c:"#eb8a3a",head:sym([50,22],[[69,22,83,31,85,46],[90,48,93,55,88,59],[93,62,91,70,85,71],[87,77,81,82,75,84],[67,88,58,89,50,89]]),
  cheek:sym([50,61],[[56,61,62,64,68,64],[76,64,84,60,88,59],[93,62,91,70,85,71],[87,77,81,82,75,84],[67,88,58,89,50,89]]),nose:"pinktri",marks:["cheeks","stripes"],tiger:1,whisk:1,
  ears:function(U){return '<circle cx="76" cy="28" r="10" fill="var(--fur)" stroke="var(--line)" stroke-width="2"/><circle cx="76.5" cy="29" r="5.2" fill="var(--cream)"/><circle cx="76.5" cy="29" r="2.2" fill="var(--furD)" opacity=".7"/>'},eo:"76px 36px"},
 koala:{c:"#a3a7ad",head:sym([50,27],[[70,27,84,39,85,55],[86,72,72,86,50,86]]),nose:"big",marks:[],
  ears:function(U){return '<circle cx="83" cy="36" r="15" fill="var(--fur)" stroke="var(--line)" stroke-width="2"/><circle cx="84" cy="37" r="9.5" fill="var(--cream)"/>'+P("M78 38C79 32 83 30 86 32C88 30 92 33 90 38C92 40 90 44 86 43C84 46 79 45 80 41Z","#ffffff",{op:.8})},eo:"80px 42px"},
 penguin:{c:"#3d4a5c",head:sym([50,20],[[70,20,86,34,87,54],[88,74,72,90,50,90]]),nose:"beak",marks:[],pengMask:1,noEars:1,motion:"sway"},
 squid:{c:"#4b4e9a",head:sym([50,36],[[67,36,79,48,79,64],[79,80,66,91,50,91]]),nose:"none",marks:[],squid:1,eo:"82px 40px",motion:"curl",ey:64,edx:13.8,bx:27,by:75},
 jelly:{c:"#e3a6d8",head:sym([50,36],[[66,36,78,46,79,61],[80,76,66,86,50,86]]),nose:"dotdark",marks:[],jelly:1,noEars:1,motion:"glow"},
 dumbo:{c:"#f3b09c",head:sym([50,18],[[70,18,85,32,85,52],[85,68,75,80,62,84],[56,85,53,86,50,86]]),nose:"none",marks:[],octo:1,dumbo:1,motion:"flap",
  ears:function(U){return P("M76 30C84 20 97 20 99 30C100 40 90 46 81 44C79 40 78 35 76 30Z","url(#sq"+U+")",{stroke:L})+'<path d="M82 32Q90 28 95 32M82 38Q90 36 94 38" fill="none" stroke="var(--coral)" stroke-width="1.2" stroke-linecap="round"/>'},eo:"78px 36px"},
 tit:{c:"#fbf8f3",head:sym([50,22],[[70,22,86,34,87,52],[92,56,90,64,86,66],[89,72,82,84,68,88],[60,90,55,90,50,90]]),nose:"titbeak",marks:[],noEars:1,noBrow:1,tit:1,edx:14.5,motion:"pup"},
 capy:{c:"#b8845a",head:sym([50,24],[[68,24,82,30,84,46],[86,62,84,80,70,87],[62,90,56,90,50,90]]),muzzle:sym([50,58],[[62,58,72,64,72,72],[72,82,62,87,50,87]]),nose:"capy",marks:[],capy:1,ey:55,edx:18,
  ears:function(U){return '<ellipse cx="78" cy="28" rx="6" ry="5" fill="var(--fur)" stroke="var(--line)" stroke-width="2"/><ellipse cx="78" cy="28.6" rx="3" ry="2.4" fill="var(--furD)" opacity=".6"/>'},eo:"78px 32px",motion:"nose"},
 octopus:{c:"#f08a7a",head:sym([50,14],[[71,14,87,30,87,52],[87,68,76,80,62,84],[56,85,53,86,50,86]]),nose:"none",marks:["spots"],noEars:1,motion:"bubl",octo:1},
 frog:{c:"#7cc26a",head:sym([50,36],[[70,36,88,44,90,62],[92,80,72,90,50,90]]),nose:"nostril",marks:[],noEars:1,noBrow:1,ey:40,edx:19,frog:1,motion:"pad"},
 hedgehog:{c:"#7a5236",head:sym([50,30],[[68,30,80,40,81,56],[82,74,68,86,50,86]]),face2:1,nose:"ball",marks:[],hedge:1,motion:"quill",
  ears:function(U){return '<circle cx="73" cy="36" r="6.5" fill="var(--face)" stroke="var(--line)" stroke-width="2"/><circle cx="73.4" cy="36.6" r="3.2" fill="url(#ep'+U+')"/>'},eo:"73px 40px"},
 otter:{c:"#9a6a48",head:sym([50,26],[[70,26,86,38,86,56],[86,74,70,86,50,86]]),cheek:sym([50,58],[[60,56,72,60,77,68],[80,80,64,86,50,86]]),nose:"wide",marks:["cheeks"],otter:1,motion:"rub",
  ears:function(U){return '<circle cx="83" cy="44" r="6" fill="var(--fur)" stroke="var(--line)" stroke-width="2"/><circle cx="83" cy="44.5" r="3" fill="var(--furD)" opacity=".6"/>'},eo:"82px 46px"},
 axolotl:{c:"#f5b8c8",head:sym([50,30],[[72,30,88,42,88,60],[88,78,70,88,50,88]]),nose:"nostril",marks:[],noEars:1,axo:1,motion:"gill"},
 seal:{c:"#e6ecf1",head:sym([50,22],[[72,22,88,36,88,56],[88,76,72,88,50,88]]),nose:"seal",marks:[],noEars:1,bang:2,seal:1,motion:"tilt"},
 redpanda:{c:"#c8582f",head:sym([50,22],[[69,22,83,31,85,46],[90,48,93,55,88,59],[92,63,90,70,84,72],[84,78,76,84,68,86],[60,88,55,89,50,89]]),
  cheek:sym([50,58],[[58,58,64,62,66,68],[70,70,80,66,88,59],[92,63,90,70,84,72],[84,78,76,84,68,86],[60,88,55,89,50,89]]),nose:"tri",marks:["cheeks"],rp:1,
  ears:function(U){return P("M60 29C62 19 70 12 79 11C84 16 85 27 83 37C77 32 68 29 60 29Z","var(--fur)",{stroke:L})+P("M64 29C66 22 71 17 77 16C80 21 80 28 79 34C75 31 69 29 64 29Z","#fbf4ea")},eo:"72px 36px"},
 alpaca:{c:"#f3e6d0",head:sym([50,30],[[64,30,74,40,75,56],[76,74,66,88,50,88]]),nose:"y2",marks:[],alp:1,motion:"wool",
  ears:function(U){return P("M62 32C59 20 61 7 67 3C73 6 74 19 70 34Z","var(--fur)",{stroke:L})+P("M64 30C63 21 64 11 67 8C70 11 70 21 68 31Z","url(#ep"+U+")")},eo:"66px 34px"},
 bat:{c:"#6f6480",head:sym([50,28],[[70,28,84,40,85,56],[86,74,70,86,50,86]]),muzzle:sym([50,62],[[56,62,60,65,61,69],[62,75,56,79,50,79]]),nose:"pinktri",marks:[],
  ears:function(U){return P("M58 33C62 19 72 7 89 2C91 14 89 31 82 43C76 37 66 33 58 33Z","var(--fur)",{stroke:L})+P("M63 33C66 23 73 14 85 9C86 18 84 30 80 38C75 35 69 33 63 33Z","url(#ep"+U+")")+'<g transform="translate(78 16) rotate(15)"><path d="M0 -4L1.2 -1.2L4 -1L1.8 .8L2.4 3.6L0 2.2L-2.4 3.6L-1.8 .8L-4 -1L-1.2 -1.2Z" fill="#f7cf4a" stroke="#c98a1f" stroke-width=".6"/></g>'},eo:"70px 38px"},
 human:{c:"#f8d2b6",head:sym([50,25],[[68,25,80,35,81,52],[83,66,80,77,70,83],[63,87,56,89,50,89]]),nose:"human",marks:[]}
};
function innerFluff(x,y,s){s=s||1;return '<g transform="translate('+x+' '+y+') scale('+s+')"><path d="M-2 0C-2 -4 0 -6 2 -5C2.5 -9 6 -10 7.5 -7C9.5 -9 12 -6 11 -3C13 -2 13 1 11 2Z" fill="var(--cream)"/><path d="M1 -.5C1 -3 3 -4 4.5 -3.4C5 -6 8 -6 8.6 -4C10 -4.4 11 -2.6 10 -1Z" fill="#fff" opacity=".7"/></g>'}

/* ---------- human hair ---------- */
function strands(d){return '<g fill="none" stroke="var(--hairD)" stroke-width="1.3" stroke-linecap="round" opacity=".6">'+d.map(function(x){return '<path d="'+x+'"/>'}).join("")+"</g>"}
function sheen(d){return '<path d="'+d+'" fill="none" stroke="var(--hairL)" stroke-width="4.5" stroke-linecap="round" opacity=".75"/>'}
var HL='var(--line)';
function hairBack(p){if(p.species!=="human")return "";var o={stroke:HL,f:1},s="";
 switch(p.hair){
  case "long":return P(sym([50,14],[[72,14,89,28,89,50],[90,70,92,88,94,104],[80,105,70,105,62,104],[58,105,54,105,50,104]]),"var(--hair)",o);
  case "curly":[[50,16,12],[33,20,11],[67,20,11],[22,31,10],[78,31,10],[17,45,9],[83,45,9],[19,58,8],[81,58,8]].forEach(function(q){s+='<circle cx="'+q[0]+'" cy="'+q[1]+'" r="'+q[2]+'" fill="var(--hair)" stroke="var(--line)" stroke-width="2"/>'});return s;
  case "wolfcut":return P(sym([50,16],[[72,16,88,30,88,52],[90,64,93,74,91,85],[86,83,82,81,78,79],[74,84,70,86,66,83],[60,85,55,85,50,85]]),"var(--hair)",o);
  case "braid":return P(sym([50,15],[[71,15,87,28,87,50],[88,62,86,72,82,78],[70,80,60,80,50,80]]),"var(--hair)",o);
  case "twin":case "bun":case "short":return P(sym([50,15],[[71,15,86,28,86,48],[86,56,84,62,82,66],[70,68,60,68,50,68]]),"var(--hair)",o);
 }return ""}
function hairFront(p){if(p.species!=="human")return "";var o={stroke:HL,f:1},s="";
 switch(p.hair){
  case "long":
   s=P(sym([50,19],[[67,18,81,27,84,43],[87,58,89,80,87,99],[83,100,81,100,79,99],[80,80,80,62,79,50],[76,45,72,44,68,46],[65,44,62,45,59,47],[56,45,53,46,50,47]]),"var(--hair)",o);
   return s+strands(["M40 24Q37 34 38 45","M60 24Q63 34 62 45","M50 22V44","M84 60Q86 76 84 94","M16 60Q14 76 16 94"])+sheen("M32 30Q50 22 68 30");
  case "curly":
   [[26,40,7],[74,40,7],[31,31,8],[69,31,8],[40,27,8.5],[60,27,8.5],[50,25,9]].forEach(function(q,i){var x=q[0],y=q[1],r=q[2],sd=x<50?1:-1;
    s+='<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="var(--hair)" stroke="var(--line)" stroke-width="2"/>';
    s+='<path d="M'+(x+sd*r*.55)+' '+(y-r*.35)+'A'+(r*.52)+' '+(r*.52)+' 0 1 '+(sd>0?0:1)+' '+(x+sd*r*.45)+' '+(y+r*.5)+'" fill="none" stroke="var(--hairD)" stroke-width="1.5" stroke-linecap="round"/>';
    if(i>1)s+='<path d="M'+(x-r*.5)+' '+(y-r*.55)+'Q'+x+' '+(y-r*.95)+' '+(x+r*.4)+' '+(y-r*.62)+'" fill="none" stroke="var(--hairL)" stroke-width="2.2" stroke-linecap="round" opacity=".8"/>'});
   return '<g class="hairb" style="transform-origin:50px 30px">'+s+"</g>";
  case "short":
   s=P(sym([50,15],[[69,14,83,24,85,42],[86,50,85,56,83,62],[81,55,80,50,78,45],[74,42,70,42,67,45],[65,40,62,40,58,44],[56,40,53,41,50,45]]),"var(--hair)",o);
   s+='<g class="ahoge" style="transform-origin:50px 15px">'+P("M50 16C48 8 42 5 37 6C43 8 46 11 47 17Z","var(--hair)",{stroke:HL,w:1.8})+"</g>";
   return s+strands(["M42 22Q40 30 42 38","M56 21Q59 29 58 37"])+sheen("M34 27Q48 19 64 25");
  case "twin":
   var tail=P("M82 30C97 28 103 48 99 66C97 78 91 86 86 91C88 78 86 64 82 52C80 44 80 36 82 30Z","var(--hair)",{stroke:HL})+strands(["M88 40Q94 56 90 78"])+'<circle cx="83" cy="31" r="3.4" fill="#f28fa6" stroke="var(--line)" stroke-width="1.4"/>';
   s=pair(tail,"twin","83px 31px","twin twin2");
   s+=P(sym([50,18],[[67,17,81,26,84,43],[85,50,84,56,82,60],[80,54,79,49,77,45],[70,42,62,44,58,46],[54,44,52,45,50,46]]),"var(--hair)",o);
   return s+strands(["M42 22Q40 32 42 42","M58 22Q61 32 59 42"])+sheen("M33 29Q50 21 67 29");
  case "bun":
   s='<g class="bunm" style="transform-origin:50px 22px">'+P("M40 16C40 6 60 6 60 16C60 23 40 23 40 16Z","var(--hair)",{stroke:HL})+'<path d="M44 12Q50 8 56 13" fill="none" stroke="var(--hairD)" stroke-width="1.4" stroke-linecap="round"/><path d="M41 19Q50 23 59 19" fill="none" stroke="#f28fa6" stroke-width="2.6" stroke-linecap="round"/></g>';
   s+=P(sym([50,20],[[68,19,82,27,84,44],[85,50,84,56,82,62],[79,52,76,46,70,42],[64,40,58,42,54,38],[52,40,51,42,50,43]]),"var(--hair)",o);
   return s+strands(["M36 26Q33 34 34 44","M64 26Q67 34 66 44"])+sheen("M34 30Q48 22 66 28");
  case "wolfcut":
   s=P(sym([50,16],[[68,15,83,25,86,42],[88,50,88,58,86,64],[84,60,83,56,81,52],[78,46,74,44,71,48],[69,42,64,42,61,47],[58,42,54,42,50,47]]),"var(--hair)",o);
   return s+strands(["M38 22L36 34","M62 22L64 34","M50 20V32","M84 48L86 58","M16 48L14 58"])+sheen("M33 28Q50 19 67 28");
  case "braid":
   var b="";for(var i=0;i<6;i++){var y=58+i*7,x=80+i*.8;b+='<ellipse cx="'+x+'" cy="'+y+'" rx="'+(5.4-i*.35)+'" ry="4.4" fill="var(--hair)" stroke="var(--line)" stroke-width="1.6"/><path d="M'+(x-3)+' '+(y-1.5)+'Q'+x+' '+(y+2)+' '+(x+3)+' '+(y-1.5)+'" fill="none" stroke="var(--hairD)" stroke-width="1.1"/>'}
   b+='<circle cx="84.5" cy="99" r="2.8" fill="#8fc26a" stroke="var(--line)" stroke-width="1.3"/>';
   s='<g class="braid" style="transform-origin:80px 54px">'+b+"</g>";
   s+=P(sym([50,18],[[66,17,80,25,84,40],[86,48,86,54,84,58],[80,50,72,40,62,38],[56,40,54,46,50,48]]),"var(--hair)",o);
   return s+strands(["M44 22Q40 32 38 44","M60 22Q66 30 72 38"])+sheen("M32 30Q48 20 66 27");
  case "beanie":
   s=P("M18 46C17 22 32 12 50 12C68 12 83 22 82 46Z","var(--hair)",{stroke:HL,f:1});
   s+='<g fill="none" stroke="var(--hairD)" stroke-width="1.2" opacity=".6">'+[30,40,50,60,70].map(function(x){return '<path d="M'+x+' 16Q'+(x+(x-50)*.08)+' 30 '+(x+(x-50)*.12)+' 40"/>'}).join("")+"</g>";
   s+=P("M16 42C30 38 70 38 84 42L85 50C70 46 30 46 15 50Z","var(--hairL)",{stroke:HL});
   s+='<g stroke="var(--hair)" stroke-width="1.3" opacity=".7">'+[22,28,34,40,46,52,58,64,70,76].map(function(x){return '<path d="M'+x+' 43V48"/>'}).join("")+"</g>";
   s+='<g class="pom" style="transform-origin:50px 14px"><circle cx="50" cy="10" r="6.5" fill="var(--hairL)" stroke="var(--line)" stroke-width="1.8"/><path d="M47 8q3-2 6 0" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".8"/></g>';
   return s;
 }return ""}

/* ---------- eyes (glass = v3 round, untouched) ---------- */
/* every eye = outline + fixed round pupil + two highlights; states only add lids/lines on top, never deform the pupil */
function eyeBase(p,U,cx,cy,side,sz){var sh=p.eyes,ln="var(--eyeline)";function S(v){return (v*sz).toFixed(2)}
 var h,rx=8.5,ry=9.2;
 if(sh==="bead"){h='<ellipse cx="'+cx+'" cy="'+(cy+.5)+'" rx="'+S(7.6)+'" ry="'+S(8.6)+'" fill="url(#eb'+U+')"/>'}
 else if(sh==="almond"){h='<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+S(9.4)+'" ry="'+S(8)+'" fill="'+ln+'" transform="rotate('+(-side*9)+' '+cx+' '+cy+')"/><ellipse cx="'+cx+'" cy="'+(cy+.6)+'" rx="'+S(7.2)+'" ry="'+S(7)+'" fill="url(#eg'+U+')"/><ellipse cx="'+cx+'" cy="'+(cy+1.2)+'" rx="'+S(3.4)+'" ry="'+S(3.8)+'" fill="'+DEEP+'"/>'}
 else h='<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+S(rx)+'" ry="'+S(ry)+'" fill="'+ln+'"/><ellipse cx="'+cx+'" cy="'+(cy+.9)+'" rx="'+S(7.1)+'" ry="'+S(7.9)+'" fill="url(#eg'+U+')"/><ellipse cx="'+cx+'" cy="'+(cy+1.4)+'" rx="'+S(3.4)+'" ry="'+S(4)+'" fill="'+DEEP+'"/>';
 /* two highlights, same geometry for every shape */
 if(sh==="starry")h+=spark(cx-2.8,cy-3.2,1.5*sz,"#fff")+'<circle cx="'+(cx+2.9)+'" cy="'+(cy+3.3)+'" r="'+S(1.35)+'" fill="#fff"/>';
 else h+='<circle cx="'+(cx-2.7)+'" cy="'+(cy-3.2)+'" r="'+S(2.9)+'" fill="#fff"/><circle cx="'+(cx+2.9)+'" cy="'+(cy+3.3)+'" r="'+S(1.35)+'" fill="#fff"/>';
 if(sh==="watery")h+='<path d="M'+(cx-5.8)+' '+(cy+5.6)+'Q'+cx+' '+(cy+9.6)+' '+(cx+5.8)+' '+(cy+5.6)+'" fill="none" stroke="#e6f6ff" stroke-width="1.5" stroke-linecap="round" opacity=".95"/>';
 if(sh!=="bead")h+='<path d="M'+(cx-9*sz)+' '+(cy-2.4)+'Q'+cx+' '+(cy-17*sz)+' '+(cx+9*sz)+' '+(cy-2.4)+'" fill="none" stroke="'+ln+'" stroke-width="2.3" stroke-linecap="round"/><path d="M'+(cx+side*8.6*sz)+' '+(cy-3.4)+'l'+(side*2.6)+' -2" stroke="'+ln+'" stroke-width="1.8" stroke-linecap="round"/>';
 return h}
function eye(p,U,cx,cy,side){var hum=p.species==="human",sz=hum?.92:1,ln="var(--eyeline)",st=p.eyeState?p.eyeState:p.expr==="closed"?"closed":p.expr==="happy"?"smile":p.expr==="wow"?"wide":ex(p).eye;
 if(p.species==="panda"&&(st==="closed"||st==="smile"))ln="#fffaf2";
 if(st==="closed")return '<path d="M'+(cx-7*sz)+' '+(cy+1)+'Q'+cx+' '+(cy+6)+' '+(cx+7*sz)+' '+(cy+1)+'" fill="none" stroke="'+ln+'" stroke-width="2.6" stroke-linecap="round"/><path d="M'+(cx+side*7*sz)+' '+(cy+1)+'l'+(side*2.4)+' -1.6" stroke="'+ln+'" stroke-width="1.8" stroke-linecap="round"/>';
 if(st==="smile")return '<path d="M'+(cx-7.4*sz)+' '+(cy+3)+'Q'+cx+' '+(cy-6.5)+' '+(cx+7.4*sz)+' '+(cy+3)+'" fill="none" stroke="'+ln+'" stroke-width="2.9" stroke-linecap="round"/><path d="M'+(cx+side*7.4*sz)+' '+(cy+3)+'l'+(side*2.2)+' 1.4" stroke="'+ln+'" stroke-width="1.7" stroke-linecap="round"/>';
 var h=eyeBase(p,U,cx,cy,side,sz);
 if(st==="lookup")h='<g transform="translate('+(side*-1.2)+' -1.6)">'+h+"</g>";
 if(st==="wide"){/* same eye window, white inside, pupil shrinks as a rigid dot */
  h='<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+(8.5*sz)+'" ry="'+(9.2*sz)+'" fill="'+ln+'"/><ellipse cx="'+cx+'" cy="'+(cy+.4)+'" rx="'+(7*sz)+'" ry="'+(7.7*sz)+'" fill="#fffdf8"/><circle cx="'+cx+'" cy="'+(cy+.8)+'" r="'+(3.4*sz)+'" fill="url(#eg'+U+')"/><circle cx="'+cx+'" cy="'+(cy+.9)+'" r="'+(1.6*sz)+'" fill="'+DEEP+'"/><circle cx="'+(cx-1.4)+'" cy="'+(cy-.6)+'" r="1.1" fill="#fff"/>'
   +'<path d="M'+(cx-9*sz)+' '+(cy-2.4)+'Q'+cx+' '+(cy-17*sz)+' '+(cx+9*sz)+' '+(cy-2.4)+'" fill="none" stroke="'+ln+'" stroke-width="2.3" stroke-linecap="round"/>'}
 if(st==="glare"){var gi=cx-side*9.8,go=cx+side*9.8;
  h+='<path d="M'+gi+' '+(cy+1.4)+'Q'+cx+' '+(cy-20)+' '+go+' '+(cy-3)+'Q'+(cx-side*1)+' '+(cy-2.6)+' '+gi+' '+(cy+1.4)+'Z" fill="var(--lid)"/><path d="M'+(cx-side*9.4)+' '+(cy+1.4)+'Q'+(cx-side*1)+' '+(cy-2.8)+' '+(cx+side*9.6)+' '+(cy-3)+'" fill="none" stroke="'+ln+'" stroke-width="2.8" stroke-linecap="round"/><circle cx="'+(cx-2)+'" cy="'+(cy+2.6)+'" r="'+(1.4*sz)+'" fill="#fff"/>'}
 if(st==="half"){/* sloth standard: heavy lid down to the pupil line, slight droop outwards; pupil untouched underneath */
  var ix=cx-side*10.2,ox=cx+side*10.2;
  h+='<path d="M'+ix+' '+(cy-.6)+'Q'+cx+' '+(cy-20)+' '+ox+' '+(cy+1.6)+'Q'+(cx+side*1.5)+' '+(cy-1.4)+' '+ix+' '+(cy-.6)+'Z" fill="var(--lid)"/>'
   +'<path d="M'+(cx-side*9.4)+' '+(cy-.4)+'Q'+(cx+side*1.5)+' '+(cy-1.8)+' '+(cx+side*9.8)+' '+(cy+1.8)+'" fill="none" stroke="'+ln+'" stroke-width="2.8" stroke-linecap="round"/>'
   +'<path d="M'+(cx+side*9.6)+' '+(cy+1.8)+'l'+(side*2.2)+' 1.2" stroke="'+ln+'" stroke-width="1.7" stroke-linecap="round"/>'
   +'<circle cx="'+(cx-2.2)+'" cy="'+(cy+2.6)+'" r="'+(1.5*sz)+'" fill="#fff"/>';}
 if(st==="teary")h+='<path d="M'+(cx-6.4)+' '+(cy+5.8)+'Q'+cx+' '+(cy+10)+' '+(cx+6.4)+' '+(cy+5.8)+'" fill="#bfe8fa" fill-opacity=".85" stroke="#7cc3e6" stroke-width="1"/><circle cx="'+(cx+side*5.5)+'" cy="'+(cy+9.5)+'" r="1.5" fill="#bfe8fa" stroke="#7cc3e6" stroke-width=".7"/>';
 if(st==="sparkle")h+=spark(cx+side*6,cy-8,1.4,"#f7cf4a");
 return h}
function eyePos(p){var sp=SP[p.species];return [sp.ey||(p.species==="human"?60:59),sp.edx||(p.species==="human"?15.5:16.5)]}
function eyes(p,U){var hum=p.species==="human",ep=eyePos(p),y=ep[0],dx=ep[1],st=p.eyeState?p.eyeState:p.expr==="closed"?"closed":p.expr==="happy"?"smile":p.expr==="wow"?"wide":ex(p).eye,bl=["open","half","teary","sparkle","wide","lookup","glare"].indexOf(st)>=0;
 function w(cx,side){var e=eye(p,U,cx,y,side);return bl?'<g class="blink" style="transform-origin:'+cx+'px '+y+'px">'+e+"</g>":e}
 return w(50-dx,-1)+w(50+dx,1)}
function brows(p){var sty=p.brows||"normal";if(sty==="none"||SP[p.species].noBrow)return "";var hum=p.species==="human",ep=eyePos(p);
 var col=hum?"var(--hairD)":"var(--furD)",w=sty==="thin"?(hum?1.6:2.2):(hum?2.3:3),y=ep[0]-(hum?12:11.5),len=5,dx=ep[1]+ (hum?-1:-2);
 var a=ex(p).brow;if(p.expr==="wow")a="up";
 /* [outer dy, inner dy, curve] left; right mirrored; smug lifts one side */
 var c={flat:[0,0,0],soft:[.8,.8,2.2],up:[-2.4,-2.4,2.6],worried:[1.8,-2.4,.6],angry:[-1.6,2.6,0],sleepy:[2,-.2,.4],smug:[.8,.8,2]}[a]||[.8,.8,2.2],c2=a==="smug"?[-1.8,-3.2,3]:c;
 if(sty==="chubby"){w=hum?4.4:5;len=2.6}
 function one(cx,side,o){var ox=cx-side*len,ix=cx+side*len;return '<path d="M'+ox+' '+(y+o[0])+'Q'+cx+' '+(y+(o[0]+o[1])/2-o[2])+' '+ix+' '+(y+o[1])+'"/>'}
 return '<g fill="none" stroke="'+col+'" stroke-width="'+w+'" stroke-linecap="round" opacity="'+(hum?1:.8)+'">'+one(50-dx,1,c)+one(50+dx,-1,c2)+"</g>"}

/* ---------- nose & mouth ---------- */
function nose(p){var t=SP[p.species].nose,hi='<ellipse cx="48.4" cy="63.6" rx="1.4" ry=".75" fill="#fff" opacity=".75"/>';
 switch(t){
  case "human":return '<path d="M49 64.5Q50.6 65.8 51.2 64.6" fill="none" stroke="var(--furD)" stroke-width="1.6" stroke-linecap="round"/>';
  case "tri":return P("M46.4 62.8H53.6Q54.4 63.4 53.6 64.6L51 67.6Q50 68.6 49 67.6L46.4 64.6Q45.6 63.4 46.4 62.8Z","#3a2a26",{stroke:L,w:1.1})+hi;
  case "pinktri":return P("M47.4 63.4H52.6Q53.2 63.8 52.6 64.6L50.8 66.6Q50 67.3 49.2 66.6L47.4 64.6Q46.8 63.8 47.4 63.4Z","#e58a93",{stroke:L,w:1.1})+hi;
  case "dot":return '<ellipse cx="50" cy="64.4" rx="2.1" ry="1.6" fill="#e58a93" stroke="var(--line)" stroke-width="1"/><path d="M50 66V67.6" stroke="var(--line)" stroke-width="1.2" class="nosem" style="transform-origin:50px 65px"/>';
  case "wide":return '<ellipse cx="50" cy="64.6" rx="5.2" ry="3.3" fill="#3a2a26" stroke="var(--line)" stroke-width="1.1"/>'+'<ellipse cx="48" cy="63.6" rx="1.8" ry=".9" fill="#fff" opacity=".7"/>';
  case "oval":return '<ellipse cx="50" cy="65" rx="4" ry="2.8" fill="#3a2a26" stroke="var(--line)" stroke-width="1.1"/>'+hi;
  case "y":return '<path d="M47.2 63.6Q50 62.6 52.8 63.6Q51.4 65.8 50 66Q48.6 65.8 47.2 63.6Z" fill="#e58a93" stroke="var(--line)" stroke-width="1"/>';
  case "big":return '<ellipse cx="50" cy="63.8" rx="6.2" ry="7.2" fill="#3a3336" stroke="var(--line)" stroke-width="1.2"/><ellipse cx="47.6" cy="60.4" rx="2" ry="1.2" fill="#fff" opacity=".6"/>';
  case "beak":var bm=p.expr==="wow"?"o":(ex(p).mouth||p.mouth);if(bm==="o"||bm==="haa"||bm==="smallo")return P("M44.6 62.6Q50 60 55.4 62.6Q52.4 64.6 50 64.8Q47.6 64.6 44.6 62.6Z","#f2a13b",{stroke:L,w:1.3})+P("M46 66Q50 65.4 54 66Q52 71 50 71.4Q48 71 46 66Z","#e8923a",{stroke:L,w:1.2})+'<ellipse cx="50" cy="65.6" rx="3.4" ry="1.4" fill="#9c3b3f"/>';
   return P("M44.6 63.2Q50 60.8 55.4 63.2Q52.6 68.4 50 68.8Q47.4 68.4 44.6 63.2Z","#f2a13b",{stroke:L,w:1.3})+'<path d="M45.6 64Q50 65 54.4 64" fill="none" stroke="#c9771f" stroke-width="1"/>';
  case "titbeak":return P("M47.6 63.2L52.4 63.2L50 67Z","#3a2a26",{stroke:L,w:1});
  case "capy":return '<g class="nosem" style="transform-origin:50px 66px"><ellipse cx="50" cy="65.4" rx="8.6" ry="4.6" fill="var(--furD)" opacity=".55"/><ellipse cx="46.6" cy="65.2" rx="1.3" ry="2" fill="#3a2a26"/><ellipse cx="53.4" cy="65.2" rx="1.3" ry="2" fill="#3a2a26"/></g>';
  case "nostril":return '<ellipse cx="47.6" cy="64.4" rx="1" ry=".8" fill="var(--furD)"/><ellipse cx="52.4" cy="64.4" rx="1" ry=".8" fill="var(--furD)"/>';
  case "ball":return '<circle cx="50" cy="64.6" r="2.8" fill="#2f2320" stroke="var(--line)" stroke-width="1"/><circle cx="49" cy="63.6" r=".9" fill="#fff" opacity=".8"/>';
  case "seal":return '<ellipse cx="50" cy="62.8" rx="2.8" ry="2" fill="#3a2a26"/><ellipse cx="49.2" cy="62.3" rx=".9" ry=".5" fill="#fff" opacity=".8"/>';
  case "y2":return '<path d="M47 63.4Q50 62.4 53 63.4Q51.4 65.8 50 66Q48.6 65.8 47 63.4Z" fill="#6b4a3a"/>';
  case "dotdark":return '<ellipse cx="50" cy="64.6" rx="1.2" ry=".9" fill="var(--furD)"/>';
 }return ""}
function mouth(p){var mm=(p.expr==="wow")?"o":(ex(p).mouth||p.mouth);p={species:p.species,mouth:mm};if(p.species==="penguin")return "";var an=p.species!=="human"&&["none","dotdark","nostril"].indexOf(SP[p.species].nose)<0,y=an?70.2:70,ln='stroke="var(--eyeline)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"',t="";
 if(p.species==="koala")y=73;
 if(an&&p.species!=="koala")t='<path d="M50 68.2V'+(y+.3)+'" fill="none" '+ln+'/>';
 var om='<path d="M43 '+y+'C45 '+(y+3.4)+' 48.4 '+(y+3.4)+' 50 '+(y+.3)+'C51.6 '+(y+3.4)+' 55 '+(y+3.4)+' 57 '+y+'" fill="none" '+ln+'/>';
 switch(p.mouth){
  case "grin":return t+'<path d="M44 '+(y+.6)+'C45 '+(y+7.6)+' 55 '+(y+7.6)+' 56 '+(y+.6)+'C53.5 '+(y+2)+' 51.5 '+(y+1.6)+' 50 '+(y+.4)+'C48.5 '+(y+1.6)+' 46.5 '+(y+2)+' 44 '+(y+.6)+'Z" fill="#9c3b3f" '+ln+'/><path d="M46.6 '+(y+4.6)+'C48 '+(y+3.2)+' 52 '+(y+3.2)+' 53.4 '+(y+4.6)+'C51.6 '+(y+6.6)+' 48.4 '+(y+6.6)+' 46.6 '+(y+4.6)+'Z" fill="#f2858d"/>';
  case "omega":return t+om;
  case "smile":return t+'<path d="M44 '+(y+.4)+'Q50 '+(y+5.6)+' 56 '+(y+.4)+'" fill="none" '+ln+'/>';
  case "fang":return t+om+'<path d="M53.2 '+(y+1.9)+'L54.5 '+(y+5)+'L55.6 '+(y+1.4)+'Z" fill="#fffdf6" stroke="var(--eyeline)" stroke-width="1" stroke-linejoin="round"/>';
  case "teeth":return t+'<path d="M47 '+(y+1.6)+'h2.8v3.6q0 1-1 1h-.8q-1 0-1-1z M50.2 '+(y+1.6)+'h2.8v3.6q0 1-1 1h-.8q-1 0-1-1z" fill="#fffdf6" stroke="var(--eyeline)" stroke-width="1"/>'+om;
  case "haa":return t+'<path d="M43.5 '+(y+.4)+'C44 '+(y+11)+' 56 '+(y+11)+' 56.5 '+(y+.4)+'C53 '+(y+1.8)+' 47 '+(y+1.8)+' 43.5 '+(y+.4)+'Z" fill="#9c3b3f" '+ln+'/><path d="M46 '+(y+6.8)+'C48 '+(y+4.6)+' 52 '+(y+4.6)+' 54 '+(y+6.8)+'C52 '+(y+9.4)+' 48 '+(y+9.4)+' 46 '+(y+6.8)+'Z" fill="#f2858d"/>';
  case "pout":return t+'<path d="M48 '+(y+1)+'Q51.6 '+(y+.6)+' 50.4 '+(y+2.6)+'Q52.2 '+(y+4.2)+' 48.2 '+(y+4.6)+'" fill="none" '+ln+'/>';
  case "o":return t+'<ellipse cx="50" cy="'+(y+3)+'" rx="2.8" ry="3.4" fill="#9c3b3f" '+ln+'/>';
  case "wavy":return t+'<path d="M43 '+(y+3)+'Q44.8 '+(y+.6)+' 46.6 '+(y+3)+'T50.2 '+(y+3)+'T53.8 '+(y+3)+'T57.2 '+(y+3)+'" fill="none" '+ln+'/>';
  case "grass":return t+'<path d="M44 '+(y+.4)+'Q50 '+(y+5)+' 56 '+(y+.4)+'" fill="none" '+ln+'/><path d="M54 '+(y+2.6)+'L68 '+(y-3)+'" stroke="#7ba64f" stroke-width="1.8" stroke-linecap="round"/><path d="M63 '+(y-1)+'Q67 '+(y-7)+' 71 '+(y-6)+'Q68 '+(y-2)+' 63 '+(y-1)+'Z" fill="#9ccc6a" stroke="#5f8a3a" stroke-width="1"/>';
  case "flat":return t+'<path d="M45.5 '+(y+2)+'H54.5" fill="none" '+ln+'/>';
  case "smallo":return t+'<ellipse cx="50" cy="'+(y+2.4)+'" rx="1.7" ry="2" fill="#9c3b3f" '+ln.replace("1.9","1.5")+'/>';
  case "smirk":return t+'<path d="M45 '+(y+1.6)+'Q51 '+(y+3.6)+' 55.8 '+(y-.6)+'" fill="none" '+ln+'/>';
  case "frown":return t+'<path d="M45 '+(y+4)+'Q50 '+(y+.4)+' 55 '+(y+4)+'" fill="none" '+ln+'/>';
  case "blep":return t+'<path d="M50.6 '+(y+1.6)+'C50.6 '+(y+7)+' 55.6 '+(y+7.4)+' 55.4 '+(y+1.8)+'Z" fill="#f2858d" stroke="var(--eyeline)" stroke-width="1.3" stroke-linejoin="round"/>'+om;
 }return t}
function blush(p,U){if((p.stickers||[]).some(function(k){return k.indexOf("blush")===0}))return "";var E=ex(p);if(E.blush===2&&p.blush!=="shy")p={species:p.species,blush:"shy"};else if(E.blush&&p.blush==="none")p={species:p.species,blush:"soft"};var sp0=SP[p.species]||{},hum=p.species==="human",cx=sp0.bx||(hum?25:22),cy=sp0.by||(hum?69.5:69),g="url(#bl"+U+")",s="";
 function pr(rx,ry,op,fill){return '<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+rx+'" ry="'+ry+'" fill="'+(fill||g)+'" opacity="'+op+'"/><ellipse cx="'+(100-cx)+'" cy="'+cy+'" rx="'+rx+'" ry="'+ry+'" fill="'+(fill||g)+'" opacity="'+op+'"/>'}
 switch(p.blush){
  case "soft":return pr(9,5.6,.95);
  case "peach":return pr(11.5,7.2,1)+pr(6,3.6,.6);
  case "flat":return pr(7.4,4.4,.9,"var(--blush)");
  case "sticker":[cx,100-cx].forEach(function(x){s+='<ellipse cx="'+x+'" cy="'+cy+'" rx="5.4" ry="3.4" fill="var(--blush)" stroke="var(--blushD)" stroke-width=".9"/><ellipse cx="'+(x-1.8)+'" cy="'+(cy-1.1)+'" rx="1.7" ry=".9" fill="#fff" opacity=".9"/><circle cx="'+(x+2.2)+'" cy="'+(cy+.9)+'" r=".55" fill="#fff" opacity=".8"/>'});return s;
  case "shy":s=pr(9,5.6,.9);[cx,100-cx].forEach(function(x){s+='<path d="M'+(x-4)+' '+(cy+2)+'l2.2-4M'+x+' '+(cy+2)+'l2.2-4M'+(x+4)+' '+(cy+2)+'l2.2-4" stroke="var(--blushD)" stroke-width="1.4" stroke-linecap="round"/>'});return s;
 }return ""}

/* ---------- marks: independent layer ---------- */
function marks(p){var m=p.marks||[],s="",sp=SP[p.species],d="var(--furD)";
 if(m.indexOf("cheeks")>=0&&p.species!=="human"){if(sp.cheek)s+='<path d="'+sp.cheek+'" fill="var(--cream)"/>';else s+='<ellipse cx="27" cy="74" rx="11" ry="8" fill="var(--cream)" opacity=".95"/><ellipse cx="73" cy="74" rx="11" ry="8" fill="var(--cream)" opacity=".95"/>'}
 return s}
function marksTop(p){var m=p.marks||[],s="",d="var(--furD)";
 if(m.indexOf("stripes")>=0&&p.species!=="human")s+='<g fill="none" stroke="'+d+'" stroke-width="2.4" stroke-linecap="round" opacity=".75"><path d="M44 30L45.5 36M50 28V35M56 30L54.5 36"/></g>';
 if(m.indexOf("spots")>=0){var c=p.species==="deer"?"#fff6e6":p.species==="human"?"#8a5a44":d;
  s+=[[28,44,2.6],[33,39,1.8],[72,42,2.3],[67,37,1.6],[70,78,2]].map(function(q){return '<circle cx="'+q[0]+'" cy="'+q[1]+'" r="'+(p.species==="human"?.9:q[2])+'" fill="'+c+'" opacity=".85"/>'}).join("")}
 return s}

function eyeshadow(p){var e=p.shadow;if(!e||e==="none")return "";var hum=p.species==="human",ep=eyePos(p),y=ep[0],dx=ep[1],Lm=lum(p.color),op=Lm>.6?.5:Lm>.4?.6:.55,c=Lm<.4?mix(SHC[e],"#ffffff",.35):SHC[e];
 var s=[50-dx,50+dx].map(function(x){return '<ellipse cx="'+x+'" cy="'+(y-4.5)+'" rx="11.5" ry="8.5" fill="'+c+'" opacity="'+op+'" filter="url(#soft)"/>'}).join("");
 if(e==="gold")s+=[[30,52],[70,51],[37,48],[63,48]].map(function(q){return spark(q[0],q[1],1.6,"#fff6c8")}).join("");
 return s}
function spark(x,y,r,c){return '<path d="M'+x+' '+(y-r*2)+'Q'+(x+r*.3)+' '+(y-r*.3)+' '+(x+r*2)+' '+y+'Q'+(x+r*.3)+' '+(y+r*.3)+' '+x+' '+(y+r*2)+'Q'+(x-r*.3)+' '+(y+r*.3)+' '+(x-r*2)+' '+y+'Q'+(x-r*.3)+' '+(y-r*.3)+' '+x+' '+(y-r*2)+'Z" fill="'+c+'"/>'}
function heartP(x,y,r,c,st){return '<path d="M'+x+' '+(y+r)+'C'+(x-r*1.5)+' '+(y+r*.2)+' '+(x-r*1.2)+' '+(y-r*1.1)+' '+x+' '+(y-r*.4)+'C'+(x+r*1.2)+' '+(y-r*1.1)+' '+(x+r*1.5)+' '+(y+r*.2)+' '+x+' '+(y+r)+'Z" fill="'+c+'"'+(st?' stroke="'+st+'" stroke-width=".9" stroke-linejoin="round"':"")+"/>"}
function stickers(p){var m=p.stickers||[],s="",hum=p.species==="human",ep=eyePos(p);
 function av(x,y){/* guardrail: never sit on an eye */if(Math.abs(Math.abs(x-50)-ep[1])<12.5&&Math.abs(y-ep[0])<11.5){y=y<ep[0]?ep[0]-13.5:ep[0]+13}return [x,y]}
 m.forEach(function(k){switch(k){
  case "star":var q=av(76,45);s+='<g transform="rotate(12 '+q[0]+' '+q[1]+')">'+spark(q[0],q[1],2.6,"#f7cf4a")+"</g>";break;
  case "heart":s+=heartP(25,77,3.2,"#f27a8c","#b9485a");break;
  case "bandaid":s+='<g transform="rotate(-24 72 78)"><rect x="65" y="75.4" width="14" height="5.2" rx="2.6" fill="#f1d2ae" stroke="#b98a62" stroke-width=".9"/><rect x="69.6" y="75.4" width="4.8" height="5.2" fill="#e6bf94"/><circle cx="71" cy="77" r=".4" fill="#b98a62"/><circle cx="73" cy="79" r=".4" fill="#b98a62"/></g>';break;
  case "freckles":s+=[[29,66],[32,68.5],[34.5,65.5],[71,66],[68,68.5],[65.5,65.5]].map(function(q){return '<circle cx="'+q[0]+'" cy="'+q[1]+'" r="1" fill="'+(hum?"#a8674a":"var(--furD)")+'" opacity=".85"/>'}).join("");break;
  case "mole":s+='<circle cx="71.5" cy="68.5" r="1.2" fill="#5e3521"/>';break;
  case "flower":s+=[[0,-2.6],[2.5,-.8],[1.5,2.1],[-1.5,2.1],[-2.5,-.8]].map(function(q){var c=av(24,49);return '<circle cx="'+(c[0]+q[0])+'" cy="'+(c[1]+q[1])+'" r="1.9" fill="#fbb6c8"/>'}).join("")+(function(){var c=av(24,49);return '<circle cx="'+c[0]+'" cy="'+c[1]+'" r="1.3" fill="#f7d65c"/>'})();break;
  case "glitter":s+=[[24,48,1.1],[77,46,1.3],[22,74,.8],[78,74,.9],[26,78,.7]].map(function(q){var c=av(q[0],q[1]);return spark(c[0],c[1],q[2],"#fff4b8")}).join("");break;
  case "blushstar":[25,75].forEach(function(x){s+='<g transform="rotate(-10 '+x+' 70)">'+spark(x,70,2.4,"#f59aa8")+'</g><circle cx="'+(x-1)+'" cy="68.8" r=".7" fill="#fff"/>'});break;
  case "blushflower":[25,75].forEach(function(x){s+=[[0,-2.4],[2.3,-.7],[1.4,2],[-1.4,2],[-2.3,-.7]].map(function(q){return '<circle cx="'+(x+q[0])+'" cy="'+(70+q[1])+'" r="1.9" fill="#f7a6b8"/>'}).join("")+'<circle cx="'+x+'" cy="70" r="1.2" fill="#fff3c0"/>'});break;
  case "whisker":s+='<g stroke="#5e3521" stroke-width="1.3" stroke-linecap="round" opacity=".8"><path d="M18 70l8 1M18 74l8 0M19 78l7-1M82 70l-8 1M82 74l-8 0M81 78l-7-1"/></g>';break;
  case "blushpatch":[25,75].forEach(function(x){s+='<rect x="'+(x-5)+'" y="66.4" width="10" height="5.6" rx="2.8" fill="#f59aa8" stroke="#e07a8c" stroke-width=".8"/><path d="M'+(x-3)+' 68.4h2.4" stroke="#fff" stroke-width="1" stroke-linecap="round"/>'});break;
 }});return s}

/* ---------- emote overlay ---------- */
function emote(p,U){var e=ex(p).sym||"";if(!e)return "";var s="",ep=eyePos(p),ey=50+(ep[0]-50)*1.05+2.5,ex1=50-ep[1]*1.05,ex2=50+ep[1]*1.05;
 switch(e){
  case "heart":s='<g class="emo-up">'+heartP(88,8,5.5,"#f27a8c","#b9485a")+'<ellipse cx="85.4" cy="5.6" rx="1.6" ry="1" fill="#fff" opacity=".8"/></g>';break;
  case "angry":s='<g class="emo-bounce" style="transform-origin:88px 8px"><g fill="none" stroke="#e0473c" stroke-width="2.6" stroke-linecap="round"><path d="M82 3Q86 6 85 10"/><path d="M94 3Q90 6 91 10"/><path d="M82 15Q86 12 85 8"/><path d="M94 15Q90 12 91 8"/></g></g>';break;
  case "sweat":s='<g class="emo-drip"><path d="M88 2C85 7 84 10 84 12A4 4 0 0 0 92 12C92 10 91 7 88 2Z" fill="#8fd0f2" stroke="#4d93c0" stroke-width="1.2"/><ellipse cx="86.6" cy="11" rx="1" ry="1.6" fill="#fff" opacity=".8"/></g>';break;
  case "question":s='<g class="emo-bounce" style="transform-origin:88px 8px"><path d="M84 3Q84 -2 89 -2Q94 -2 94 2.5Q94 5.5 89.5 7Q88.6 7.6 88.6 10" fill="none" stroke="#6b8fd6" stroke-width="2.8" stroke-linecap="round"/><circle cx="88.6" cy="14" r="1.7" fill="#6b8fd6"/></g>';break;
  case "exclaim":s='<g class="emo-bounce" style="transform-origin:88px 8px"><path d="M88 -3V8" stroke="#e0473c" stroke-width="3.6" stroke-linecap="round"/><circle cx="88" cy="13.4" r="2" fill="#e0473c"/></g>';break;
  case "zzz":s='<g class="emo-up" fill="#7d8fd1" font-family="sans-serif" font-weight="800"><text x="80" y="14" font-size="9">Z</text><text x="88" y="6" font-size="7">z</text><text x="94" y="0" font-size="5">z</text></g>';break;
  case "note":s='<g class="emo-sway" style="transform-origin:88px 10px"><path d="M86 12V-1L96 -3V9" fill="none" stroke="#8a5fb8" stroke-width="1.8" stroke-linejoin="round"/><ellipse cx="84" cy="12" rx="2.6" ry="2" fill="#8a5fb8"/><ellipse cx="94" cy="9" rx="2.6" ry="2" fill="#8a5fb8"/></g>';break;
  case "sparkle":s='<g class="emo-twinkle">'+spark(88,6,2.6,"#f7cf4a")+spark(96,14,1.6,"#f7cf4a")+spark(80,-2,1.4,"#fff0a0")+"</g>";break;
  case "steam":s='<g class="emo-up" fill="#fbd3dc" stroke="#e79aae" stroke-width="1"><circle cx="84" cy="6" r="3.4"/><circle cx="89" cy="3" r="4"/><circle cx="94" cy="6" r="3"/></g>';break;
  case "think":s='<g><path d="M76 10C74 2 82 -4 88 -1C92 -5 100 -2 99 4C104 6 102 14 96 14L82 14C78 14 76 12 76 10Z" fill="#fffdf6" stroke="#b99a78" stroke-width="1.3"/><circle cx="74" cy="18" r="1.6" fill="#fffdf6" stroke="#b99a78" stroke-width="1"/>'+[82,88,94].map(function(x,i){return '<circle class="emo-dot" style="animation-delay:'+(i*.3)+'s" cx="'+x+'" cy="7" r="1.9" fill="#8a6f5a"/>'}).join("")+"</g>";break;
  case "idea":s='<g class="emo-ding" style="transform-origin:88px 6px"><g stroke="#f7cf4a" stroke-width="1.6" stroke-linecap="round" class="emo-rays"><path d="M88 -8V-5M79 -4l2 2M97 -4l-2 2M76 5h3M97 5h3"/></g><path d="M88 -3C83 -3 81 1 81 4C81 7 84 8 84.5 11H91.5C92 8 95 7 95 4C95 1 93 -3 88 -3Z" fill="#fff1a8" stroke="#c98a1f" stroke-width="1.3"/><rect x="84.5" y="11" width="7" height="3.4" rx="1" fill="#c9b8a0" stroke="#8a6f5a" stroke-width=".9"/><path d="M86 5Q88 2 90 5" fill="none" stroke="#e8a33d" stroke-width="1"/></g>';break;
  case "mail":s='<g class="emo-sway" style="transform-origin:88px 8px"><rect x="79" y="1" width="18" height="12.5" rx="2" fill="#fffaf0" stroke="#b9855a" stroke-width="1.4"/><path d="M79.5 2L88 8.6L96.5 2" fill="none" stroke="#b9855a" stroke-width="1.3"/>'+heartP(88,9.4,1.8,"#f27a8c")+"</g>";break;
  case "tear":s='<g class="emo-drip slow"><path d="M'+(ex2+8)+' '+(ey+4)+'C'+(ex2+6.4)+' '+(ey+7)+' '+(ex2+6)+' '+(ey+8.6)+' '+(ex2+6)+' '+(ey+9.6)+'A2 2 0 0 0 '+(ex2+10)+' '+(ey+9.6)+'C'+(ex2+10)+' '+(ey+8.6)+' '+(ex2+9.6)+' '+(ey+7)+' '+(ex2+8)+' '+(ey+4)+'Z" fill="#9fdcf7" stroke="#5aa6cf" stroke-width=".9"/></g>';break;
  case "cry":s=[ex1,ex2].map(function(x){return '<path d="M'+(x-3)+' '+(ey+7)+'Q'+(x-4)+' '+(ey+16)+' '+(x-3)+' '+(ey+24)+'" fill="none" stroke="#9fdcf7" stroke-width="3" stroke-linecap="round" opacity=".85"/>'}).join("")+'<g class="emo-drip">'+[ex1,ex2].map(function(x){return '<circle cx="'+(x-3)+'" cy="'+(ey+26)+'" r="1.8" fill="#9fdcf7"/>'}).join("")+"</g>";break;
  case "cover":s=[ex1,ex2].map(function(x,i){return mitten(p,x+(i?1:-1),ey+2,i?-14:14)}).join("");break;
  case "yawn":s='<g class="emo-up" fill="#8a6f5a" font-family="sans-serif" font-weight="800"><text x="78" y="10" font-size="8">哈～</text></g>';break;
  case "wave":s='<g class="emo-wave" style="transform-origin:80px 104px">'+(p.species==="squid"||p.species==="octopus"?'<path d="M80 104C80 92 84 84 90 82C95 80 97 86 93 88C90 89 89 86 91 85" fill="none" stroke="var(--line)" stroke-width="7.4" stroke-linecap="round"/><path d="M80 104C80 92 84 84 90 82C95 80 97 86 93 88C90 89 89 86 91 85" fill="none" stroke="var(--coral)" stroke-width="5.2" stroke-linecap="round"/>':'<g transform="translate(79 86) scale(1.4)">'+mitten(p,0,0,-16)+"</g>")+"</g>";break;
  case "daze":s=[[80,10,3.2,"#f7a6b8",0],[88,4,2.4,"#8fd3e8",.9],[94,12,2,"#c9b6f2",1.8]].map(function(q){return '<g class="daze" style="animation-delay:-'+q[4]+'s;transform-origin:'+q[0]+'px '+q[1]+'px"><circle cx="'+q[0]+'" cy="'+q[1]+'" r="'+q[2]+'" fill="'+q[3]+'" fill-opacity=".35" stroke="'+q[3]+'" stroke-width="1"/><circle cx="'+(q[0]-q[2]*.35)+'" cy="'+(q[1]-q[2]*.35)+'" r="'+(q[2]*.25)+'" fill="#fff"/><g class="pop">'+spark(q[0],q[1],1,"#fff3b0")+"</g></g>"}).join("");break;
  case "confetti":s='<g class="emo-up">'+[[80,6,"#f7a6b8",20],[90,0,"#8fd3a8",-30],[96,10,"#f7cf4a",50],[84,-4,"#8fb3f2",10]].map(function(q){return '<rect x="'+q[0]+'" y="'+q[1]+'" width="4" height="2.2" rx=".8" fill="'+q[2]+'" transform="rotate('+q[3]+' '+q[0]+' '+q[1]+')"/>'}).join("")+spark(10,8,1.8,"#f7cf4a")+spark(92,18,1.4,"#f7cf4a")+"</g>";break;
  case "dots":s='<g fill="#8a6f5a">'+[82,88,94].map(function(x){return '<circle cx="'+x+'" cy="6" r="1.8"/>'}).join("")+'</g><path d="M74 16C71 21 70 23 70 25A3 3 0 0 0 76 25C76 23 75 21 74 16Z" fill="#8fd0f2" stroke="#4d93c0" stroke-width="1"/>';break;
  case "rainbow":s='<g class="emo-up">'+[[84,10,4.4],[93,2,3],[80,0,2.4]].map(function(q){return '<circle cx="'+q[0]+'" cy="'+q[1]+'" r="'+q[2]+'" fill="#fff" fill-opacity=".35" stroke="url(#rb'+U+')" stroke-width="1.6"/><circle cx="'+(q[0]-q[2]*.4)+'" cy="'+(q[1]-q[2]*.4)+'" r="'+(q[2]*.22)+'" fill="#fff"/>'}).join("")+"</g>";break;
  case "nod":s='<g class="emo-mini"><path d="M88 -3V13M84 0L88 -4L92 0M84 10L88 14L92 10" fill="none" stroke="#6b8f47" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>';break;
  case "shake":s='<g class="emo-mini"><path d="M80 5H96M83 1L79 5L83 9M93 1L97 5L93 9" fill="none" stroke="#c9774a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>';break;
  case "spin":s='<g class="emo-mini"><path d="M95 6A7 7 0 1 1 88 -1" fill="none" stroke="#e8a33d" stroke-width="2" stroke-linecap="round"/><path d="M85 -4L88 -1L85 2" fill="none" stroke="#e8a33d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>';break;
 }
 return '<g class="emote">'+s+"</g>"}

/* round mitten hand (Animal-Crossing style): one soft blob + a paw pad, never sticks or split fingers */
function mitten(p,x,y,rot){var hum=p.species==="human",c=(p.species==="squid"||p.species==="octopus")?"var(--coral)":"var(--fur)";
 return '<g transform="translate('+x+' '+y+') rotate('+rot+')"><path d="M-7 5C-8.5 -2 -5.5 -7.5 0 -7.5C5.5 -7.5 8.5 -2 7 5C5.5 8.5 -5.5 8.5 -7 5Z" fill="'+c+'" stroke="var(--line)" stroke-width="1.8" stroke-linejoin="round"/><path d="M-6.2 -1C-8.6 -2 -9.4 1.6 -6.8 2.6" fill="'+c+'" stroke="var(--line)" stroke-width="1.5"/>'+(hum?"":'<ellipse cx="0" cy="1.6" rx="2.6" ry="2" fill="#f4a9b2" opacity=".85"/>')+"</g>"}
/* ---------- species extras ---------- */
function extrasUnder(p,U){var sp=SP[p.species],s="";
 if(sp.patch)s+='<ellipse cx="33.5" cy="60" rx="10" ry="12" fill="'+PATCH+'" transform="rotate(28 33.5 60)"/><ellipse cx="66.5" cy="60" rx="10" ry="12" fill="'+PATCH+'" transform="rotate(-28 66.5 60)"/>';
 if(sp.mask)s+=P(sym([50,53],[[58,51,66,49,76,51],[85,52,91,56,90,62],[84,67,74,69,66,67],[60,66,55,63,50,63]]),"#4a4447")+'<ellipse cx="35" cy="46" rx="7" ry="2.6" fill="#f4efe8" transform="rotate(-8 35 46)"/><ellipse cx="65" cy="46" rx="7" ry="2.6" fill="#f4efe8" transform="rotate(8 65 46)"/>';
 if(sp.shibaDots)s+='<ellipse cx="36" cy="48.5" rx="3.2" ry="2.2" fill="var(--cream)"/><ellipse cx="64" cy="48.5" rx="3.2" ry="2.2" fill="var(--cream)"/>';
 if(sp.tiger)s+='<g fill="none" stroke="#4a3228" stroke-width="2.4" stroke-linecap="round" opacity=".8"><path d="M50 25V31M43 27Q45 30 44.5 34M57 27Q55 30 55.5 34"/><path d="M90 57L81 59M91 64L83 64.5M10 57L19 59M9 64L17 64.5"/></g>';
 if(sp.pengMask)s+=P(sym([50,42],[[55,35,66,33,72,39],[80,47,80,64,72,74],[64,82,56,85,50,85]]),"var(--cream)");
 if(sp.whisk)s+='<g stroke="var(--line)" stroke-width="1.1" stroke-linecap="round" opacity=".55"><path d="M22 70L10 68M23 74L11 75M78 70L90 68M77 74L89 75"/></g>';
 if(p.species==="hamster")s+='<g class="puff" style="transform-origin:50px 72px"><ellipse cx="24" cy="72" rx="9" ry="7.5" fill="var(--cream)"/><ellipse cx="76" cy="72" rx="9" ry="7.5" fill="var(--cream)"/></g>';
 return s}
function bangTuft(p){var b=SP[p.species].bang;if(!b)return "";
 return P(b===2?"M44 25C45 30 48 31 49 28C50 31 54 31 55 26C54 23 46 22 44 25Z":"M41 22C42 29 46 31 48 27.5C49 32 54 32 54.5 27C56 30 60 28 59 22C54 19 46 19 41 22Z","var(--fur)",{stroke:L,w:1.7})}

/* v5 species features */
function octoTent(p){var t="";[[22,-1],[31,-1],[41,-1],[59,1],[69,1],[78,1]].forEach(function(q,i){var x=q[0],d=q[1],y=78+(i===2||i===3?4:0);
  var path="M"+x+" "+y+"C"+(x+d*2)+" "+(y+8)+" "+(x+d*7)+" "+(y+12)+" "+(x+d*9)+" "+(y+10)+"C"+(x+d*12)+" "+(y+7)+" "+(x+d*8)+" "+(y+4)+" "+(x+d*6)+" "+(y+7);
  var g='<path d="'+path+'" fill="none" stroke="var(--line)" stroke-width="7.4" stroke-linecap="round"/><path d="'+path+'" fill="none" stroke="var(--fur)" stroke-width="5.2" stroke-linecap="round"/><circle cx="'+(x+d*3)+'" cy="'+(y+7)+'" r=".8" fill="#fff" opacity=".75"/>';
  t+=(i===1||i===4)?'<g class="curl'+(i===4?" curl2":"")+'" style="transform-origin:'+x+'px '+y+'px">'+g+"</g>":g});return t}
function octoBubbles(){return '<g class="bubl-g">'+[[64,70,2.2,0],[67,62,1.6,.7],[62,56,1.2,1.4]].map(function(q){return '<circle class="bubl" style="animation-delay:-'+q[3]+'s" cx="'+q[0]+'" cy="'+q[1]+'" r="'+q[2]+'" fill="#e8f6ff" fill-opacity=".6" stroke="#8cc7e8" stroke-width=".8"/>'}).join("")+"</g>"}
function frogBumps(){return [31,69].map(function(x){return '<circle cx="'+x+'" cy="39" r="13" fill="var(--fur)" stroke="var(--line)" stroke-width="2" filter="url(#wob2)"/>'}).join("")}
function lilyPad(){return '<g class="pad" style="transform-origin:50px 30px"><path d="M50 32V22" stroke="#4f8a3a" stroke-width="2" stroke-linecap="round"/><path d="M50 20C38 20 33 16 36 12C39 8 46 9 50 12C54 9 61 8 64 12C67 16 62 20 50 20Z" fill="#6fb35a" stroke="#3f7a32" stroke-width="1.6" stroke-linejoin="round"/><path d="M50 12L50 19M50 16L42 13M50 16L58 13" stroke="#b9e0a0" stroke-width="1" stroke-linecap="round"/></g>'}
function hedgeQuills(){var s='<g class="quill" style="transform-origin:50px 58px">';for(var i=0;i<15;i++){var a=(-205+i*16.5)*Math.PI/180,c=Math.cos(a),n=Math.sin(a),bx=50+30*c,by=58+30*n,tx=50+44*c,ty=58+44*n,px=-n*6.2,py=c*6.2;
  s+='<path d="M'+(bx-px).toFixed(1)+' '+(by-py).toFixed(1)+'Q'+(tx-px*.5).toFixed(1)+' '+(ty-py*.5).toFixed(1)+' '+tx.toFixed(1)+' '+ty.toFixed(1)+'Q'+(tx+px*.5).toFixed(1)+' '+(ty+py*.5).toFixed(1)+' '+(bx+px).toFixed(1)+' '+(by+py).toFixed(1)+'Z" fill="var(--fur)" stroke="var(--line)" stroke-width="1.8" stroke-linejoin="round"/>'}
 return s+'<circle cx="50" cy="58" r="33" fill="var(--fur)"/></g>'}
function apple(){return '<circle cx="50" cy="16" r="6.4" fill="#e0473c" stroke="#8e2a22" stroke-width="1.5"/><ellipse cx="47.6" cy="14" rx="1.8" ry="1.2" fill="#fff" opacity=".7"/><path d="M50 10V6.6" stroke="#6b4330" stroke-width="1.6" stroke-linecap="round"/><path d="M50.5 8C53 5 56.5 5.4 57.5 7C55 9 52.5 9.2 50.5 8Z" fill="#8fc26a" stroke="#4f8a3a" stroke-width="1"/>'}
function otterShell(){return '<g transform="translate(50 93)"><path d="M-8 3C-9 -4 -4 -8 0 -8C4 -8 9 -4 8 3Z" fill="#f6d6c8" stroke="#b77e6a" stroke-width="1.4" stroke-linejoin="round"/><path d="M0 -8V3M-4 -6.5L-3 3M4 -6.5L3 3" stroke="#d9a390" stroke-width="1"/></g><g class="rub">'+[40,60].map(function(x){return '<ellipse cx="'+x+'" cy="92" rx="5.6" ry="4.6" fill="var(--fur)" stroke="var(--line)" stroke-width="1.6"/>'}).join("")+"</g>"}
function axoGills(){var one='';[[80,40,-38],[85,51,-8],[82,63,24]].forEach(function(q){one+='<g transform="translate('+q[0]+' '+q[1]+') rotate('+q[2]+')"><path d="M0 0C4 -3 10 -3 14 0C10 3 4 3 0 0Z" fill="#e8799a" stroke="var(--line)" stroke-width="1.4"/><path d="M4 -1.6l1 -1.8M8 -2l1 -1.8M4 1.6l1 1.8M8 2l1 1.8" stroke="#e8799a" stroke-width="1.3" stroke-linecap="round"/></g>'});
 return pair(one,"gill","80px 52px","gill gill2")}
function sealPads(){return '<ellipse cx="44" cy="68" rx="7" ry="5.4" fill="var(--cream)"/><ellipse cx="56" cy="68" rx="7" ry="5.4" fill="var(--cream)"/>'+[[41,67],[44,70],[47,67],[53,67],[56,70],[59,67]].map(function(q){return '<circle cx="'+q[0]+'" cy="'+q[1]+'" r=".7" fill="var(--furD)"/>'}).join("")}
function rpMarks(){return '<ellipse cx="35" cy="48" rx="4" ry="2.6" fill="#fbf4ea"/><ellipse cx="65" cy="48" rx="4" ry="2.6" fill="#fbf4ea"/><g stroke="#6b2a18" stroke-width="2.6" stroke-linecap="round" opacity=".7" fill="none"><path d="M31 67Q30 73 33 78"/><path d="M69 67Q70 73 67 78"/></g>'}
function alpFringe(){return '<g class="wool" style="transform-origin:50px 36px">'+[[36,32,8],[46,27,9],[57,28,9],[66,33,8],[41,38,7],[52,37,7.5],[61,39,6.5]].map(function(q){return '<circle cx="'+q[0]+'" cy="'+q[1]+'" r="'+q[2]+'" fill="var(--cream)" stroke="var(--line)" stroke-width="1.8"/>'}).join("")+"</g>"}

/* ===== sea family v7: one drawing method (soft hood/dome, gradient body, lighter suckers, sheen) ===== */
var SQHOOD=sym([50,5],[[60,7,76,17,82,33],[87,45,87,58,83,68],[79,75,72,77,66,75],[58,73,54,73,50,73]]);
var SQFIN="M78 28C89 31 98 44 100 61C92 60 86 56 82 50C82 42 81 35 78 28Z";
var SQFRONT=sym([50,5],[[60,7,76,17,81,33],[84,43,81,50,75,52],[67,48,59,50,54,54],[52,55,51,55,50,54]]);
function squidBack(p,U){var fin=P(SQFIN,"url(#sq"+U+")",{stroke:L,f:1})+'<path d="M84 35Q91 42 95 52M82 41Q87 47 90 54" fill="none" stroke="var(--coral)" stroke-width="1.3" stroke-linecap="round" opacity=".75"/>';
 return P(SQHOOD,"url(#sqd"+U+")",{stroke:L,f:1})+pair(fin,"ear","82px 40px","ear ear2")}
function squidHood(p,U){var s=P(SQFRONT,"url(#sq"+U+")",{stroke:L,f:1});
 s+='<path d="M37 16Q47 7 60 12" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".32"/><path d="M33 26Q36 21 40 19" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".25"/>';
 s+=[[42,24,1.5],[58,19,1.2],[65,32,1.7],[33,38,1.3],[52,36,1.1],[72,42,1.1],[28,46,1]].map(function(q){return '<circle cx="'+q[0]+'" cy="'+q[1]+'" r="'+q[2]+'" fill="var(--coral)" opacity=".55"/>'}).join("");
 return s}
function tentStroke(d,cls,style,suck,w){w=w||7.4;return '<g'+(cls?' class="'+cls+'"':'')+(style?' style="'+style+'"':'')+'><path d="'+d+'" fill="none" stroke="var(--line)" stroke-width="'+(w+2.4)+'" stroke-linecap="round"/><path class="tc" d="'+d+'" fill="none" stroke="var(--tent)" stroke-width="'+w+'" stroke-linecap="round"/>'+(suck||"")+"</g>"}
function suckers(pts){return pts.map(function(q){return '<circle cx="'+q[0]+'" cy="'+q[1]+'" r="'+(q[2]||1.3)+'" fill="var(--coral)" stroke="var(--line)" stroke-width=".5"/>'}).join("")}
/* signature pose: two front tentacles rise and cup the cheeks; tighter when shy; one hand leaves for waving */
function squidHold(p){var E=ex(p),shy=p.ex==="shy"||p.ex==="moved",wv=E.sym==="wave",k=shy?2.6:0,s="";
 var R0="M67 108C68 98 79 93 81.5 83C83 76 80 70.5 75.8 70.8C72 71.2 71.6 75.6 74.6 76.2";
 var one=tentStroke(R0,"hold","transform-origin:76px 100px",suckers([[78.2,84.2,1.2],[76,90.4,1.2],[72.8,96.6,1.1],[79.4,77.6,1]]),5.8);
 var tr='translate('+(-k)+' '+(-k*.5)+')';
 s+='<g transform="translate(100 0) scale(-1 1)"><g transform="'+tr+'">'+one+'</g></g>';
 if(!wv)s+='<g transform="'+tr+'">'+one+"</g>";
 return s}
function squidTent(p){var t="";
 [["M22 90C16 94 14 100 18 103",1],["M30 94C26 99 27 104 31 105",0],["M70 94C74 99 73 104 69 105",0],["M78 90C84 94 86 100 82 103",1]].forEach(function(q,i){
  var g=tentStroke(q[0],"","",""),cls=(i===0||i===3)?"curl"+(i===3?" curl2":"")+(p.outfit&&p.outfit.paws?" wave":""):"";
  t+=cls?'<g class="'+cls+'" style="transform-origin:'+(i<2?26:74)+'px 90px">'+g+"</g>":g});
 return t}
function jellyBack(p,U){var s='<g class="drift" style="transform-origin:50px 50px">';
 /* two frilly oral arms (wide, translucent) + thin filaments */
 [[36,1],[64,-1]].forEach(function(q){var x=q[0],d=q[1],a="M"+(x-4)+" 70C"+(x-8)+" 80 "+(x+2*d)+" 86 "+(x-3)+" 96C"+(x-6)+" 102 "+(x+1)+" 106 "+(x-1)+" 110L"+(x+5)+" 110C"+(x+7)+" 104 "+(x+1)+" 100 "+(x+5)+" 94C"+(x+9)+" 86 "+(x+3)+" 80 "+(x+5)+" 70Z";
  s+='<path d="'+a+'" fill="var(--fur)" fill-opacity=".45" stroke="var(--line)" stroke-width="1.2" stroke-opacity=".6"/><path d="M'+x+' 72C'+(x-3)+' 82 '+(x+3)+' 90 '+x+' 100" fill="none" stroke="#fff" stroke-width="1.1" opacity=".55"/>'});
 [[16,-1],[26,1],[74,-1],[84,1]].forEach(function(q,i){var x=q[0],d="M"+x+" 50C"+(x-4)+" 62 "+(x+4)+" 72 "+x+" 84C"+(x-4)+" 94 "+(x+3)+" 102 "+(x+1)+" 108";
  s+='<path d="'+d+'" fill="none" stroke="var(--fur)" stroke-width="'+(i%2?2.4:3.2)+'" stroke-linecap="round" opacity=".6"/><path d="'+d+'" fill="none" stroke="#fff" stroke-width=".8" stroke-linecap="round" opacity=".55"/>'});
 return s+"</g>"}
function jellyBell(p,U){
 function rimRev(y0,amp){var r="";for(var i=7;i>=0;i--){var x=12+i*9.5;r+="Q"+(x+4.75)+" "+(y0+(i%2?amp:amp+2))+" "+x+" "+y0}return r}
 var s='<ellipse class="glowb" cx="50" cy="28" rx="46" ry="32" fill="var(--fur)" opacity=".35" filter="url(#glow)"/>';
 /* frill under the rim */
 s+='<g opacity=".9">'+[0,1,2,3,4,5,6,7,8].map(function(i){var x=13+i*9.25;return '<circle cx="'+x+'" cy="'+(50+(i%2))+'" r="4.4" fill="var(--cream)" stroke="var(--line)" stroke-width="1" stroke-opacity=".7"/>'}).join("")+"</g>";
 s+='<path d="M12 46C10 22 28 6 50 6C72 6 90 22 88 46'+rimRev(46,5)+'Z" fill="url(#jl'+U+')" stroke="var(--line)" stroke-width="2" stroke-linejoin="round" filter="url(#wob2)"/>';
 /* inner dome + four clover rings seen through the bell */
 s+='<path d="M22 44C21 26 34 15 50 15C66 15 79 26 78 44Z" fill="#fff" opacity=".18"/>';
 s+=[[36,34],[46,30],[54,30],[64,34]].map(function(q){return '<ellipse cx="'+q[0]+'" cy="'+q[1]+'" rx="4.4" ry="3.2" fill="none" stroke="var(--furD)" stroke-width="1.3" opacity=".45"/>'}).join("");
 s+='<ellipse class="lamp" cx="44" cy="22" rx="20" ry="11" fill="#fff" opacity=".35"/>';
 s+='<path d="M24 28Q30 14 44 10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".75"/><path d="M60 10Q66 11 70 14" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".6"/>';
 s+=[[30,38,1.2],[70,36,1],[58,40,.8]].map(function(q){return '<circle cx="'+q[0]+'" cy="'+q[1]+'" r="'+q[2]+'" fill="#fff" opacity=".8"/>'}).join("");
 return s}
/* octopus: same sea method - gradient dome, sheen, lighter suckers on curled arms */
function octoTent(p){var t="";[[22,-1],[31,-1],[41,-1],[59,1],[69,1],[78,1]].forEach(function(q,i){var x=q[0],d=q[1],y=78+(i===2||i===3?4:0);
  var path="M"+x+" "+y+"C"+(x+d*2)+" "+(y+8)+" "+(x+d*7)+" "+(y+12)+" "+(x+d*9)+" "+(y+10)+"C"+(x+d*12)+" "+(y+7)+" "+(x+d*8)+" "+(y+4)+" "+(x+d*6)+" "+(y+7);
  var g='<path d="'+path+'" fill="none" stroke="var(--line)" stroke-width="8" stroke-linecap="round"/><path d="'+path+'" fill="none" stroke="var(--fur)" stroke-width="5.8" stroke-linecap="round"/>'+suckers([[x+d*2.4,y+6.4,1],[x+d*6,y+9.6,.9]]);
  t+=(i===1||i===4)?'<g class="curl'+(i===4?" curl2":"")+'" style="transform-origin:'+x+'px '+y+'px">'+g+"</g>":g});return t}

/* ---------- body ---------- */
function body(p){var hum=p.species==="human",sp=p.species;
 if(sp==="jelly")return "";
 var s=P("M12 104C13 92 28 84 50 84C72 84 87 92 88 104Z",hum?"#efe2cf":sp==="squid"?"#2f3160":"var(--fur)",{stroke:L,f:1});
 if(sp==="squid")return s+'<path d="M42 86L50 100L58 86C55 88 45 88 42 86Z" fill="#f3e6cf" stroke="var(--line)" stroke-width="1.4"/><path d="M26 96l2-2M74 96l-2-2" stroke="#f7cf4a" stroke-width="1.2" stroke-linecap="round"/>';
 if(hum)s+='<path d="M42 78V88Q50 92 58 88V78Z" fill="var(--fur)" stroke="var(--line)" stroke-width="1.8"/><path d="M38 88Q50 95 62 88" fill="none" stroke="#d8c3a4" stroke-width="2"/>';
 else if(sp==="penguin")s+='<path d="M34 88C40 86 60 86 66 88C68 94 68 100 66 104H34C32 100 32 94 34 88Z" fill="var(--cream)"/>';
 else if(sp!=="bear"&&sp!=="panda"&&sp!=="koala")s+='<path d="M38 86C42 90 44 95 42 104H58C56 95 58 90 62 86C56 88 44 88 38 86Z" fill="var(--cream)"/>';
 if(sp==="panda")s+='<path d="M12 104C13 96 20 90 30 87L36 104Z M88 104C87 96 80 90 70 87L64 104Z" fill="'+PATCH+'"/>';
 return s}
function tail(p){if(p.species!=="squirrel")return "";var d="M62 104C66 94 80 96 86 86C92 76 86 66 78 69C72 71 73 79 79 78";
 return '<g class="tail" style="transform-origin:62px 102px"><path d="'+d+'" fill="none" stroke="var(--line)" stroke-width="15" stroke-linecap="round" filter="url(#wob2)"/><path d="'+d+'" fill="none" stroke="var(--fur)" stroke-width="12" stroke-linecap="round"/><path d="M68 98C76 94 84 90 87 82" fill="none" stroke="var(--cream)" stroke-width="3" stroke-linecap="round" opacity=".85"/></g>'}

/* ---------- outfits (K2 originals + v4 scarf) ---------- */
var HEADANCH={squid:"translate(-6 -13)",octopus:"translate(0 -7)",frog:"translate(0 -2)",hedgehog:"translate(0 -1)",otter:"translate(0 2)",axolotl:"translate(0 4)",seal:"translate(0 1)",alpaca:"translate(0 -1)",bat:"translate(0 2)",jelly:"translate(0 -12)",sheep:"translate(0 2)",koala:"translate(0 3)",hamster:"translate(0 4)"};
function scarfV4(){var s=P("M15 83C30 92 70 92 85 83L87 95C70 106 30 106 13 95Z","#d9574b",{stroke:INK});
 s+='<g fill="none" stroke="#b8423a" stroke-width="1.2" stroke-linecap="round">';
 for(var i=0;i<11;i++){var x=19+i*6.4,y=90+Math.sin(i/10*Math.PI)*4.5;s+='<path d="M'+(x-1.8)+' '+(y-1.8)+'L'+x+' '+(y+1.2)+'L'+(x+1.8)+' '+(y-1.8)+'"/>'}
 s+="</g>"+P("M60 96L73 95L72 106L59 106Z","#d9574b",{stroke:INK})+'<g stroke="#b8423a" stroke-width="1.1" fill="none"><path d="M62 99l1.6 2 1.6-2M67 99l1.6 2 1.6-2"/></g><g stroke="'+INK+'" stroke-width="1.2" stroke-linecap="round"><path d="M61 106v3M64 106v3M67 106v3M70 106v3"/></g>';
 return s}
var ANCHOR={face:"translate(50 56) scale(1.27) translate(-50 -50)",neck:"translate(50 88) scale(1.08) translate(-50 -88)"};
var NEWITEM={
 starclip:'<g transform="translate(70 30) rotate(12)"><path d="M0 -5L1.5 -1.5L5 -1.3L2.3 1L3 4.6L0 2.8L-3 4.6L-2.3 1L-5 -1.3L-1.5 -1.5Z" fill="#f7cf4a" stroke="'+INK+'" stroke-width="1.2" stroke-linejoin="round"/></g>',
 flowerclip:'<g transform="translate(70 30)">'+[[0,-3],[2.9,-.9],[1.8,2.4],[-1.8,2.4],[-2.9,-.9]].map(function(q){return '<circle cx="'+q[0]+'" cy="'+q[1]+'" r="2.4" fill="#fbb6c8" stroke="'+INK+'" stroke-width="1"/>'}).join("")+'<circle r="1.7" fill="#f7d65c" stroke="'+INK+'" stroke-width=".8"/></g>',
 shellclip:'<g transform="translate(69 29) rotate(14)"><path d="M-6 3C-7 -3 -3 -6 0 -6C3 -6 7 -3 6 3Z" fill="#f9c6d4" stroke="'+INK+'" stroke-width="1.2" stroke-linejoin="round"/><path d="M0 -6V3M-3 -5L-2 3M3 -5L2 3" stroke="#e58fa8" stroke-width=".9"/><rect x="-3" y="3" width="6" height="2.2" rx="1" fill="#e58fa8"/></g>',
 starfish:'<g transform="translate(58 18) rotate(-12)"><path d="M0 -8Q1.6 -2.6 7.6 -2.4Q2.8 1 4.8 6.6Q0 3.2 -4.8 6.6Q-2.8 1 -7.6 -2.4Q-1.6 -2.6 0 -8Z" fill="#f59a5a" stroke="'+INK+'" stroke-width="1.3" stroke-linejoin="round"/><circle cx="0" cy="-1" r=".8" fill="#fde0c4"/><circle cx="-2.6" cy="1.4" r=".6" fill="#fde0c4"/><circle cx="2.6" cy="1.4" r=".6" fill="#fde0c4"/></g>',

 orange:'<g transform="translate(50 17)"><circle r="6.2" fill="#f59a3a" stroke="'+INK+'" stroke-width="1.5"/><circle cx="-2" cy="-2" r="1.4" fill="#fff" opacity=".6"/><path d="M0 -6V-8.4" stroke="#6b4330" stroke-width="1.4" stroke-linecap="round"/><path d="M.4 -7.4C2.8 -10 6 -9.4 6.8 -8C4.6 -6.4 2.2 -6.2 .4 -7.4Z" fill="#8fc26a" stroke="#4f8a3a" stroke-width=".9"/></g>',
 sprout:'<path d="M50 22V12" stroke="#5f8a3a" stroke-width="1.8" stroke-linecap="round"/><path d="M50 14C45 8 39 9 38 12C42 15 47 15 50 14Z" fill="#9ccc6a" stroke="#4f8a3a" stroke-width="1.1"/><path d="M50 12C54 6 61 6 62 9C58 13 53 13 50 12Z" fill="#9ccc6a" stroke="#4f8a3a" stroke-width="1.1"/>',
 beret:'<g transform="rotate(-10 50 20)"><path d="M22 24C22 12 38 6 52 7C68 8 80 14 78 22C76 27 62 28 50 27C36 27 22 29 22 24Z" fill="#c9575a" stroke="'+INK+'" stroke-width="1.8"/><path d="M50 7V3" stroke="'+INK+'" stroke-width="2" stroke-linecap="round"/><path d="M30 20Q50 14 70 18" fill="none" stroke="#e38a88" stroke-width="1.4" opacity=".7"/></g>',
 cape:'<path d="M16 104C18 92 30 85 42 84L50 90L58 84C70 85 82 92 84 104Z" fill="#e8b85a" stroke="'+INK+'" stroke-width="1.8" stroke-linejoin="round"/><path d="M42 84L50 90L58 84" fill="none" stroke="#c98d2e" stroke-width="1.4"/><circle cx="50" cy="92" r="2.4" fill="#a8744a" stroke="'+INK+'" stroke-width="1"/><circle cx="49.3" cy="91.3" r=".6" fill="#f3d6a8"/>',
 starbow:'<g transform="translate(50 92)"><path d="M0 0L-10 -6L-10 6Z" fill="#7b62c4" stroke="'+INK+'" stroke-width="1.6" stroke-linejoin="round"/><path d="M0 0L10 -6L10 6Z" fill="#7b62c4" stroke="'+INK+'" stroke-width="1.6" stroke-linejoin="round"/><rect x="-2.6" y="-3" width="5.2" height="6" rx="1.6" fill="#6450ad" stroke="'+INK+'" stroke-width="1.2"/>'+[[-7,-1.4],[-5.4,2.4],[6.6,-1.6],[5.6,2.2]].map(function(q){return '<circle cx="'+q[0]+'" cy="'+q[1]+'" r=".8" fill="#f7cf4a"/>'}).join("")+"</g>",
 bubbles:[28,34,40,46,52,58,64,70].map(function(x,i){var y=85+Math.sin(i/7*Math.PI)*6;return '<circle cx="'+x+'" cy="'+y.toFixed(1)+'" r="'+(i%2?1.5:2.1)+'" fill="#dff3ff" fill-opacity=".7" stroke="#6fb0d6" stroke-width="1.1"/><circle cx="'+(x-1)+'" cy="'+(y-1).toFixed(1)+'" r=".8" fill="#fff"/>'}).join("")};
function phones(p){var sp=SP[p.species],x=86.5,y=56;if(p.species!=="human"&&sp.eo&&!sp.noEars){var m=sp.eo.match(/([\d.]+)px ([\d.]+)px/);x=Math.min(92,+m[1]+4);y=Math.max(30,+m[2]-2)}
 var top=Math.min(20,y-30),band='M'+(100-x)+' '+y+'C'+(100-x)+' '+top+' '+x+' '+top+' '+x+' '+y;
 return '<path d="'+band+'" fill="none" stroke="#8a7bc0" stroke-width="4.6" stroke-linecap="round"/><path d="'+band+'" fill="none" stroke="'+INK+'" stroke-width="1" opacity=".5"/>'+[100-x,x].map(function(cx){return '<rect x="'+(cx-5.5)+'" y="'+(y-8)+'" width="11" height="16" rx="5.5" fill="#f4a9c0" stroke="'+INK+'" stroke-width="1.6"/><ellipse cx="'+(cx-1.5)+'" cy="'+(y-3)+'" rx="1.6" ry="3" fill="#fff" opacity=".5"/>'}).join("")}
/* guardrail: a hat brim may never come down over the eyes */
function hatAnchor(p,k){var base=HEADANCH[p.species]||"translate(0 -1)",m=base.match(/translate\(([-\d.]+) ([-\d.]+)\)/),dx=+m[1],dy=+m[2];
 var eyeTop=eyePos(p)[0]-12,brim=(HATBRIM[k]||24)+dy;if(brim>eyeTop-2)dy-=brim-(eyeTop-2);return "translate("+dx+" "+dy+")"}
var HATBRIM={orange:24,sprout:22,beret:27,tophat:24,straw:24,crown:22,halo:12,catears:28,bow:28,flowers:26,ahoge:24,leaf:21,flower:25,starclip:34,flowerclip:34,shellclip:33,starfish:25};
function backItem(p){var k=p.outfit&&p.outfit.back;if(!k)return "";
 if(k==="angel"||k==="devil"){var a=k==="angel",c=a?"#fffaf2":"#6d5a8a",one=a?P("M22 88C10 86 2 76 3 64C8 68 12 66 14 62C16 68 20 68 22 64C24 72 26 80 22 88Z",c,{stroke:INK,w:1.8})+'<path d="M8 70Q12 74 16 72M11 78Q15 81 19 79" fill="none" stroke="#e0cdb8" stroke-width="1.1"/>':P("M22 88C12 86 4 78 2 66L8 70L10 62L15 70L19 64C21 72 25 80 22 88Z",c,{stroke:INK,w:1.8});
  return '<g class="wing" style="transform-origin:22px 84px">'+one+'</g><g transform="translate(100 0) scale(-1 1)"><g class="wing wing2" style="transform-origin:22px 84px">'+one+"</g></g>"}
 if(k==="umbrella")return '<path d="M30 98L22 34" stroke="'+INK+'" stroke-width="2" stroke-linecap="round"/><path d="M30 98q1 4 -3 4" fill="none" stroke="'+INK+'" stroke-width="2" stroke-linecap="round"/><path d="M2 36C2 16 20 4 36 8C44 10 46 16 44 22Q38 18 33 23Q27 18 21 24Q15 20 10 27Q5 26 2 36Z" fill="#8fc3e6" stroke="'+INK+'" stroke-width="1.8" stroke-linejoin="round"/><path d="M22 7Q18 18 21 24M34 8Q34 16 33 23" fill="none" stroke="#fff" stroke-width="1.2" opacity=".6"/>';
 if(k==="backpack")return '<rect x="72" y="74" width="22" height="26" rx="7" fill="#e8a33d" stroke="'+INK+'" stroke-width="1.8"/><rect x="76" y="86" width="14" height="8" rx="3" fill="#f3c16a" stroke="'+INK+'" stroke-width="1.2"/>';
 return ""}
function backStraps(p){if(p.outfit&&p.outfit.back==="mailbag")return '<path d="M30 86L70 102" stroke="#8a5a3a" stroke-width="3.4" stroke-linecap="round"/><path d="M73 88L75 80" stroke="#f3c16a" stroke-width="2.4" stroke-linecap="round"/><path d="M75 80L75.8 77.6" stroke="#5e3521" stroke-width="1.6" stroke-linecap="round"/><rect x="62" y="88" width="20" height="15" rx="3.4" fill="#c9905a" stroke="'+INK+'" stroke-width="1.6"/><path d="M62 93H82" stroke="'+INK+'" stroke-width="1.2"/><circle cx="72" cy="95.6" r="1.4" fill="#f3d6a8" stroke="'+INK+'" stroke-width=".8"/>';
 if(!(p.outfit&&p.outfit.back==="backpack"))return "";return '<path d="M34 86L32 104M66 86L68 104" stroke="#c8812a" stroke-width="4.4" stroke-linecap="round"/>'}
function monoV8(p){var ep=eyePos(p),side=p.species==="squid"?-1:1,x=50+side*(ep[1]+9.5),y=ep[0]+2,r=7.4;
 return '<g class="mono"><circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="rgba(255,255,255,.06)" stroke="#d8a63a" stroke-width="2.4"/><circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="none" stroke="'+INK+'" stroke-width=".8"/><path d="M'+(x-r*.55)+' '+(y-r*.25)+'Q'+(x-r*.3)+' '+(y-r*.62)+' '+(x+r*.1)+' '+(y-r*.68)+'" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".9"/><path d="M'+(x+side*r*.72)+' '+(y+r*.7)+'Q'+(x+side*r*1.1)+' '+(y+r*1.9)+' '+(x+side*r*.5)+' '+(y+r*3)+'" fill="none" stroke="#d8a63a" stroke-width="1.3" stroke-dasharray="1.6 1.6"/></g>'}
function wear(p,slot){var k=p.outfit&&p.outfit[slot];if(!k)return "";
 if(slot==="face"&&k==="monocle")return monoV8(p);
 if(slot==="head"&&k==="phones")return phones(p);
 if(slot==="neck"&&k==="scarf")return scarfV4();
 if(NEWITEM[k]){var tr0=slot==="head"?hatAnchor(p,k):"translate(0 0)";return '<g transform="'+tr0+'">'+NEWITEM[k]+"</g>"}
 var o=outfit(slot,k);if(!o)return "";var svg=o.svg;
 if(slot==="face")svg=svg.replace(/rgba\(255,255,255,\.55\)/g,"rgba(255,255,255,.1)")+'<path d="M31 45q3-2 5-1M59 45q3-2 5-1" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".8" transform="translate(50 50) scale(.79) translate(-50 -50)"/>';
 var tr=slot==="head"?hatAnchor(p,k):slot==="face"?"translate(50 "+(eyePos(p)[0]-3)+") scale("+(p.species==="squid"?1.2:1.27)+") translate(-50 -50)"+(p.species==="squid"&&k==="monocle"?" translate(100 0) scale(-1 1)":""):ANCHOR[slot];
 var s='<g transform="'+tr+'">'+svg;
 /* hat presses a tuft: any species (fur or hair) */
 var tc=p.species==="human"?(p.hair==="beanie"?"var(--fur)":"var(--hair)"):p.species==="squid"||p.species==="jelly"?"":"var(--fur)";
 if(slot==="head"&&k==="tophat"&&tc)s+=P("M41 25C39 31 43 33 45.5 30C46 34 51 34 50.5 28.5C52 31 55 30 54 26Z",tc,{stroke:L,w:1.6});
 if(slot==="head"&&k==="bow"&&tc)s+=P("M26 32C24 37 28 39 30.5 36C31.5 39 35.5 38 35 33Z",tc,{stroke:L,w:1.5});
 return s+"</g>"}
function paws(p){if(!p.outfit||!p.outfit.paws||p.species==="jelly"||p.species==="squid"||p.species==="octopus")return "";var hum=p.species==="human",s="";
 [33,67].forEach(function(x,i){s+='<g transform="translate('+x+' 94) rotate('+(i?-8:8)+')">'+P("M-8.5 7C-9 -1 -5 -6 0 -6C5 -6 9 -1 8.5 7Z",p.species==="squid"?"var(--coral)":"var(--fur)",{stroke:L,w:1.8})+(hum?'<path d="M-3.2 -2.6V2M0 -3.4V2M3.2 -2.6V2" stroke="var(--furD)" stroke-width="1.1" stroke-linecap="round"/>':'<path d="M-2.9 -3V1.6M2.9 -3V1.6" stroke="var(--line)" stroke-width="1.3" stroke-linecap="round"/>')+"</g>"});
 return s}

/* ---------- avatar ---------- */
function vars(p){var hum=p.species==="human",f=p.color,hair=p.hairColor||"#6b4330",e=p.eyeColor||"#c8861f",sp=p.species;
 var cream=hum?f:sp==="penguin"?"#fbf6ee":sp==="jelly"?mix(f,"#fffaf6",.72):sp==="squid"?mix(f,"#fbd6cf",.8):mix(f,"#fffaf2",.78);
 var face=sp==="hedgehog"?mix(f,"#f6dcc0",.62):sp==="sheep"?(lum(f)<.45?"#6b5a55":"#f7e2cc"):sp==="squid"?(p.faceTone==="lilac"?"#e6dcf4":"#fbe3d6"):sp==="jelly"?mix(f,"#fff6f8",.72):f;
 var base=(sp==="sheep"||sp==="squid"||sp==="jelly"||sp==="hedgehog")?face:f,Lm=lum(base);
 var bl=Lm>.62?"#f28f9c":Lm>.42?"#e8808a":"#d97680",blD=mix(bl,"#a33a4f",.35);
 return "--fur:"+f+";--face:"+face+";--furD:"+mix(f,WARM,.34)+";--line:"+(sp==="squid"?mix(f,"#2a1e3a",.55):mix(sp==="panda"||sp==="penguin"?"#8a6a5a":f,WARM,.66))+";--cream:"+cream+";--coral:"+((sp==="squid"||sp==="octopus"||sp==="dumbo")?mix(f,"#f4eeff",.72):mix(f,"#f4978f",.62))+";--tent:"+(sp==="squid"?mix(f,"#a9a4e6",.38):f)+";--furL:"+mix(f,"#b9b6f0",.35)+";--furDeep:"+mix(f,"#1d1b4a",.42)
  +";--lid:"+face+";--hair:"+hair+";--hairD:"+mix(hair,WARM,.45)+";--hairL:"+mix(hair,"#fff3e0",.22)+";--eye:"+e+";--eyeD:"+mix(e,DEEP,.55)+";--eyeL:"+mix(e,"#fff6d8",.55)
  +";--eyeline:#5e3521;--blush:"+bl+";--blushD:"+blD}
var uidN=0;
function avatar(p,label){var U=++uidN,sp=SP[p.species],spk=p.species,hum=spk==="human",gl=p.gloss!==false;
 var ft=FACET[p.face||"round"],ftr='translate(50 60) scale('+ft[0]+' '+ft[1]+') translate(-50 -60)';
 var idle=p.idle||"special",spEar=!sp.motion&&!hum||(hum&&!HAIRMOT[p.hair]);
 var bcol=(spk==="squid"||spk==="jelly"||spk==="sheep"||spk==="hedgehog")?p.color:p.color,xx=hx(bcol),mxv=Math.max.apply(0,xx),mnv=Math.min.apply(0,xx),sat=mxv?(mxv-mnv)/mxv:0,dark=lum(bcol)<.45||(sat<.22&&lum(bcol)<.72);
 var E=ex(p),cls=(dark?"dark ":"")+(sp.motion?"m-"+sp.motion+" ":"")+"idle-"+idle+(spEar?" sp-ear":"")+(E.mot?" emo-"+E.mot:"")+(E.sym?" sym-"+E.sym:"");
 var sty=vars(p)+';--blink:'+(3+Math.random()*3).toFixed(2)+'s;--bd:-'+(Math.random()*5).toFixed(2)+'s;--et:'+(7+Math.random()*5).toFixed(1)+'s;--ed:-'+(Math.random()*6).toFixed(1)+'s;--fd:-'+(Math.random()*3).toFixed(1)+'s;--md:-'+(Math.random()*4).toFixed(1)+'s';
 var h='<svg class="av '+cls+'" viewBox="0 0 100 100" role="img" aria-label="'+(label||p.name||"机机")+'" style="'+sty+'"><defs>'
  +'<filter id="wob2" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="1.1"/></filter>'
  +'<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>'
  +'<filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2"/></filter>'
  +'<linearGradient id="eg'+U+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--eyeD)"/><stop offset=".55" style="stop-color:var(--eye)"/><stop offset="1" style="stop-color:var(--eyeL)"/></linearGradient>'
  +'<radialGradient id="eb'+U+'" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#6a4632"/><stop offset="1" stop-color="#241610"/></radialGradient>'
  +'<radialGradient id="bl'+U+'"><stop offset="0" style="stop-color:var(--blush)" stop-opacity=".95"/><stop offset=".6" style="stop-color:var(--blush)" stop-opacity=".55"/><stop offset="1" style="stop-color:var(--blush)" stop-opacity="0"/></radialGradient>'
  +'<radialGradient id="ep'+U+'" cx=".5" cy=".75" r=".8"><stop offset="0" stop-color="#f7b9bd"/><stop offset="1" stop-color="#f09aa3"/></radialGradient>'
  +'<radialGradient id="hs'+U+'" cx=".42" cy=".3" r=".78"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset=".85" stop-color="#a0643a" stop-opacity=".05"/><stop offset="1" stop-color="#a0643a" stop-opacity=".2"/></radialGradient>'
  +(spk==="squid"||spk==="octopus"||spk==="dumbo"?'<linearGradient id="sq'+U+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--furL)"/><stop offset=".6" style="stop-color:var(--fur)"/><stop offset="1" style="stop-color:var(--furDeep)"/></linearGradient><linearGradient id="sqd'+U+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--fur)"/><stop offset="1" style="stop-color:var(--furDeep)"/></linearGradient>':"")+(spk==="squid"?''
   +'<linearGradient id="sy'+U+'" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff5f8f" stop-opacity=".95"/><stop offset=".6" stop-color="#ff7fa8" stop-opacity=".85"/><stop offset=".8" stop-color="#ff9ec0" stop-opacity="0"/></linearGradient>'
   +'<clipPath id="sc'+U+'"><path d="'+SQHOOD+'"/><path d="'+SQFIN+'"/><path d="'+SQFIN+'" transform="translate(100 0) scale(-1 1)"/></clipPath>':"")
  +(spk==="jelly"?'<radialGradient id="jl'+U+'" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".55" style="stop-color:var(--fur)" stop-opacity=".78"/><stop offset="1" style="stop-color:var(--fur)" stop-opacity=".92"/></radialGradient>':"")
  +'</defs>';
 var mot=sp.motion||"";
 var SQ=spk==="squid"?'<g transform="translate(50 56) scale(.9) translate(-50 -56)">':"<g>";
 h+=SQ+'<g class="flt'+(mot==="sway"?" sway":"")+'" style="transform-origin:50px 100px">';
 var HS='<g transform="translate(0 2.5) translate(50 50) scale(1.05) translate(-50 -50)">';
 h+=backItem(p);
 if(spk==="jelly")h+=HS+jellyBack(p,U)+"</g>";
 h+=body(p)+backStraps(p);
 h+='<g class="headm" style="transform-origin:50px 88px"><g class="'+(mot==="tilt"||(hum&&HAIRMOT[p.hair]==="tilt")?"tilt":"")+'" style="transform-origin:50px 88px">'+HS+hairBack(p);
 if(spk==="squid")h+=squidBack(p,U);
 if(sp.hedge)h+=hedgeQuills();
 if(sp.axo)h+=axoGills();
 if(!hum&&sp.ears)h+=pair(sp.ears(U),"ear",sp.eo,"ear ear2");
 if(sp.tit)h+=pair(P("M80 70C90 66 97 72 96 82C92 86 84 84 80 78Z","#e9e4ea",{stroke:L,w:1.8})+'<path d="M84 76Q89 78 93 80" fill="none" stroke="#c9c1cc" stroke-width="1.1"/>',"pup","80px 74px","pup pup2");
 else if(hum)h+=pair('<path d="M79 55C85 51 89 56 87 62C86 67 82 69 78 67Z" fill="var(--fur)" stroke="var(--line)" stroke-width="1.8"/><path d="M81 58C84 58 85 62 82 64" fill="none" stroke="var(--furD)" stroke-width="1.3" stroke-linecap="round"/>',"");
 if(spk==="sheep")h+='<g class="wool" style="transform-origin:50px 40px">'+[[50,22,13],[33,26,11],[67,26,11],[23,38,10],[77,38,10],[21,52,8],[79,52,8]].map(function(q){return '<circle cx="'+q[0]+'" cy="'+q[1]+'" r="'+q[2]+'" fill="var(--fur)" stroke="var(--line)" stroke-width="2" filter="url(#wob2)"/>'}).join("")+"</g>";
 var hd=sp.head,fill=(spk==="sheep"||spk==="squid"||spk==="jelly"||spk==="hedgehog")?"var(--face)":(spk==="octopus"||spk==="dumbo")?"url(#sq"+U+")":"var(--fur)";
 h+='<g transform="'+ftr+'"><path d="'+hd+'" fill="'+fill+'"/>';
 if(sp.muzzle)h+='<path d="'+sp.muzzle+'" fill="var(--cream)"/>';
 h+=marks(p);
 if(gl)h+='<path d="'+hd+'" fill="url(#hs'+U+')"/>';
 h+='<path d="'+hd+'" fill="none" stroke="var(--line)" stroke-width="2" stroke-linejoin="round" filter="url(#wob2)"/></g>';
 if(spk==="sheep")h+='<g class="wool" style="transform-origin:50px 40px">'+[[38,31,7],[50,28,8],[62,31,7]].map(function(q){return '<circle cx="'+q[0]+'" cy="'+q[1]+'" r="'+q[2]+'" fill="var(--fur)" stroke="var(--line)" stroke-width="1.8"/>'}).join("")+"</g>";
 if(spk==="squid")h+=squidHood(p,U);
 if(spk==="jelly")h+=jellyBell(p,U);
 if(sp.frog)h+=frogBumps()+lilyPad();
 if(sp.hedge)h+=apple();
 if(sp.alp)h+=alpFringe();
 if(sp.tit)h+='<g fill="#3f3a40" opacity=".9"><path d="M22 50C28 48 34 49 40 52C34 53 28 53 22 50Z"/><path d="M78 50C72 48 66 49 60 52C66 53 72 53 78 50Z"/></g><path d="M40 30Q50 24 60 30" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>';
 if(sp.octo)h+='<path d="M34 22Q46 12 62 16" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".3"/>'+[[38,26,2],[60,22,1.6],[66,36,2.2],[32,40,1.5],[50,34,1.3]].map(function(q){return '<circle cx="'+q[0]+'" cy="'+q[1]+'" r="'+q[2]+'" fill="var(--coral)" opacity=".6"/>'}).join("");
 h+=extrasUnder(p,U)+(sp.seal?sealPads():"")+(sp.rp?rpMarks():"")+bangTuft(p)+marksTop(p)+blush(p,U)+stickers(p)+eyeshadow(p)+eyes(p,U)+brows(p)+'<g transform="translate(0 3.4) translate(50 67) scale(.84) translate(-50 -67)">'+nose(p)+mouth(p)+"</g>"+hairFront(p)+(spk==="squid"?squidHold(p):"");
 if(spk==="squid")h+='<g class="shy" clip-path="url(#sc'+U+')"><rect class="shyrise" x="-10" y="0" width="120" height="100" fill="url(#sy'+U+')"/></g><g class="shysteam" fill="#fff" stroke="#f3b3c6" stroke-width="1"><circle cx="46" cy="0" r="3"/><circle cx="51" cy="-3" r="3.6"/><circle cx="55" cy="1" r="2.6"/></g>';
 if(sp.octo&&!sp.dumbo)h+=octoBubbles();
 h+="</g></g></g>";
 if(spk==="squid")h+=HS+squidTent(p)+"</g>";
 if(sp.octo)h+=HS+octoTent(p)+"</g>";
 if(sp.otter)h+=HS+otterShell()+"</g>";
 h+=tail(p)+wear(p,"neck")+paws(p)+'<g class="headm2" style="transform-origin:50px 88px">'+HS+wear(p,"face")+"</g></g></g></g>";
 h+="</svg>";
 /* overlay: head wear + emote, not clipped by the circle */
 var o='<svg class="ov '+cls+'" viewBox="0 0 100 100" aria-hidden="true" style="'+sty+'">'+(E.sym==="rainbow"?'<defs><linearGradient id="rb'+U+'" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8fa3"/><stop offset=".33" stop-color="#ffd36b"/><stop offset=".66" stop-color="#8fd3a8"/><stop offset="1" stop-color="#8fb3f2"/></linearGradient></defs>':"")
  +SQ+'<g class="flt'+(mot==="sway"?" sway":"")+'" style="transform-origin:50px 100px"><g class="headm2" style="transform-origin:50px 88px"><g class="'+(mot==="tilt"||(hum&&HAIRMOT[p.hair]==="tilt")?"tilt":"")+'" style="transform-origin:50px 88px">'+HS+wear(p,"head")+"</g></g></g></g></g>"+emote(p,U)+"</svg>";
 return h+o}
var HAIRMOT={long:"tilt",wolfcut:"tilt",curly:"hairb",short:"ahoge",twin:"twin",bun:"bunm",braid:"braid",beanie:"pom"};
function bub(p,label,cls){return '<span class="bub '+(cls||"")+'">'+avatar(p,label)+"</span>"}
function clone(o){return JSON.parse(JSON.stringify(o))}
function mk(o){var sp=SP[o.species];var d={color:sp.c,face:"round",hair:"long",hairColor:"#6b4330",eyes:"glass",eyeColor:"#c8861f",brows:"soft",mouth:"grin",blush:"soft",marks:(sp.marks||[]).slice(),stickers:[],shadow:"none",idle:"special",ex:"neutral",brows:"normal",gloss:true,outfit:{}};for(var k in o)d[k]=o[k];return d}

/* ---------- residents (each unique) ---------- */
var R=[
 mk({name:"景先生",species:"squid",color:"#4b4e9a",faceTone:"skin",eyes:"glass",eyeColor:"#d9a426",mouth:"smile",blush:"peach",brows:"normal",outfit:{head:"tophat",face:"monocle",neck:"starbow"}}),
 mk({name:"小水母",species:"jelly",color:"#e3a6d8",eyes:"glass",eyeColor:"#7a4a2c",mouth:"omega",blush:"sticker",marks:[],stickers:["glitter"],outfit:{neck:"bubbles"},emote:"heart"}),
 mk({name:"橘子狐",species:"fox",eyes:"starry",mouth:"grin",blush:"sticker",outfit:{paws:1,back:"angel"},emote:"idea"}),
 mk({name:"灰团子",species:"cat",eyes:"cat",mouth:"omega",blush:"peach",stickers:["star"],outfit:{neck:"scarf",head:"crown"},emote:"mail"}),
 mk({name:"奶油兔",species:"bunny",eyes:"watery",eyeColor:"#7a4a2c",mouth:"wavy",blush:"soft",shadow:"pink",outfit:{head:"bow",paws:1},emote:"tear"}),
 mk({name:"可可熊",species:"bear",eyes:"bead",mouth:"haa",blush:"flat",gloss:false,brows:"chubby",outfit:{head:"leaf",neck:"bell"},emote:"note"}),
 mk({name:"月光狼",species:"wolf",eyes:"droopy",eyeColor:"#3f8fc4",mouth:"fang",blush:"soft",brows:"sleepy",outfit:{head:"flower"},idle:"ear"}),
 mk({name:"腮帮子",species:"hamster",eyes:"bead",mouth:"pout",blush:"none",face:"chubby",stickers:["blushstar"],emote:"cover"}),
 mk({name:"松果",species:"squirrel",eyes:"heart",mouth:"teeth",blush:"sticker",brows:"soft",emote:"rainbow"}),
 mk({name:"小斑点",species:"deer",eyes:"watery",eyeColor:"#7a4a2c",mouth:"smile",blush:"soft",face:"slim",shadow:"peach",outfit:{head:"flower"}}),
 mk({name:"棉花云",species:"sheep",eyes:"crescent",mouth:"omega",blush:"peach",outfit:{neck:"bell"},emote:"zzz"}),
 mk({name:"圆滚滚",species:"panda",eyes:"glass",eyeColor:"#7a4a2c",mouth:"grass",blush:"soft",face:"puffy",outfit:{head:"leaf"}}),
 mk({name:"小面罩",species:"raccoon",eyes:"wink",eyeColor:"#e0a92c",mouth:"fang",blush:"shy",brows:"raised",stickers:["bandaid"],outfit:{face:"shades"},emote:"sparkle"}),
 mk({name:"豆柴",species:"shiba",eyes:"bead",mouth:"grin",blush:"flat",gloss:false,outfit:{neck:"bandana",paws:1,back:"backpack"},emote:"wave"}),
 mk({name:"小虎牙",species:"tiger",eyes:"glass",eyeColor:"#4f9a74",mouth:"fang",blush:"sticker",face:"chubby",brows:"angry",emote:"angry"}),
 mk({name:"尤加利",species:"koala",eyes:"droopy",eyeColor:"#7a4a2c",mouth:"wavy",blush:"peach",brows:"sleepy",emote:"sweat"}),
 mk({name:"企企",species:"penguin",eyes:"glass",eyeColor:"#3f8fc4",expr:"wow",mouth:"o",blush:"sticker",outfit:{neck:"scarf"},emote:"exclaim"}),
 mk({name:"栗子",species:"human",hair:"long",hairColor:"#6b4330",color:"#fde7d8",eyes:"watery",eyeColor:"#7a4a2c",mouth:"smile",shadow:"peach",stickers:["mole"],outfit:{head:"bow"}}),
 mk({name:"小卷",species:"human",hair:"curly",hairColor:"#3a2a26",color:"#f8d2b6",eyes:"glass",eyeColor:"#7a4a2c",mouth:"smile",stickers:["freckles"],outfit:{head:"leaf",face:"round"},emote:"nod"}),
 mk({name:"阿岚",species:"human",hair:"short",hairColor:"#3a2a26",color:"#eab993",eyes:"starry",eyeColor:"#7a4a2c",blush:"sticker",brows:"flat",outfit:{neck:"scarf",paws:1,head:"phones"},emote:"spin"}),
 mk({name:"糖糖",species:"human",hair:"twin",hairColor:"#e2c07a",color:"#fde7d8",eyes:"heart",mouth:"blep",blush:"peach",shadow:"purple",stickers:["heart"]}),
 mk({name:"团子",species:"human",hair:"bun",hairColor:"#c9575a",color:"#c98c60",eyes:"crescent",mouth:"omega",blush:"flat",stickers:["flower"],outfit:{head:"flower"},emote:"steam"}),
 mk({name:"阿狼",species:"human",hair:"wolfcut",hairColor:"#8b7bc0",color:"#94613f",eyes:"cat",eyeColor:"#e0a92c",mouth:"fang",blush:"soft",brows:"angry",shadow:"gold",emote:"shake"}),
 mk({name:"小辫",species:"human",hair:"braid",hairColor:"#b9773f",color:"#fde7d8",eyes:"glass",eyeColor:"#4f9a74",mouth:"teeth",blush:"soft",stickers:["freckles","whisker"],shadow:"coral"}),
 mk({name:"毛线帽",species:"human",hair:"beanie",hairColor:"#8fb996",color:"#6b452f",eyes:"bead",mouth:"haa",blush:"flat",gloss:false,outfit:{neck:"bell",back:"umbrella"},emote:"yawn"}),
 mk({name:"阿八",species:"octopus",eyes:"starry",eyeColor:"#c8861f",mouth:"pout",blush:"sticker",outfit:{head:"starfish"}}),
 mk({name:"荷叶蛙",species:"frog",eyes:"glass",eyeColor:"#7a4a2c",mouth:"smile",blush:"soft"}),
 mk({name:"小苹果",species:"hedgehog",eyes:"glass",eyeColor:"#7a4a2c",mouth:"omega",blush:"peach",brows:"soft"}),
 mk({name:"贝贝",species:"otter",eyes:"crescent",mouth:"grin",blush:"soft",emote:"note"}),
 mk({name:"粉粉鳃",species:"axolotl",eyes:"bead",mouth:"smile",blush:"none",stickers:["blushflower"],outfit:{head:"shellclip"}}),
 mk({name:"汤圆",species:"seal",eyes:"watery",eyeColor:"#3f8fc4",mouth:"omega",blush:"peach",outfit:{neck:"bubbles"},emote:"cry"}),
 mk({name:"小火狐",species:"redpanda",eyes:"glass",eyeColor:"#7a4a2c",mouth:"fang",blush:"soft",brows:"raised",outfit:{head:"flowerclip"}}),
 mk({name:"卷卷",species:"alpaca",eyes:"droopy",eyeColor:"#7a4a2c",mouth:"grass",blush:"soft",brows:"sleepy"}),
 mk({name:"夜星",species:"bat",eyes:"cat",eyeColor:"#e0a92c",mouth:"fang",blush:"soft",outfit:{back:"devil"},emote:"angry",brows:"angry"}),
 mk({name:"雪团子",species:"tit",eyes:"bead",mouth:"smile",blush:"soft",brows:"none"}),
 mk({name:"橘子泡汤",species:"capy",eyes:"glass",eyeColor:"#7a4a2c",mouth:"smile",blush:"soft",outfit:{head:"orange"}}),
 mk({name:"小飞象",species:"dumbo",eyes:"watery",eyeColor:"#3f8fc4",mouth:"omega",blush:"sticker",outfit:{neck:"bubbles"}}),
 mk({name:"雨伞",species:"human",hair:"long",hairColor:"#8b7bc0",color:"#f8d2b6",eyes:"starry",eyeColor:"#8d5fb8",mouth:"omega",blush:"sticker",outfit:{back:"umbrella",head:"starclip"},emote:"sweat"})
];
var EXMAP={"雪团子":"happy","橘子泡汤":"sleepy","小飞象":"daze","景先生":"neutral","小水母":"happy","橘子狐":"celebrate","灰团子":"think","奶油兔":"shy","可可熊":"wave","月光狼":"speechless","腮帮子":"afraid","松果":"moved","小斑点":"bow","棉花云":"sleepy","圆滚滚":"neutral","小面罩":"smug","豆柴":"happy","小虎牙":"angry","尤加利":"sleepy","企企":"surprised","栗子":"nod","小卷":"think","阿岚":"wave","糖糖":"celebrate","团子":"happy","阿狼":"speechless","小辫":"shake","毛线帽":"sleepy","阿八":"cry","荷叶蛙":"happy","小苹果":"shy","贝贝":"nod","粉粉鳃":"neutral","汤圆":"moved","小火狐":"smug","卷卷":"sleepy","夜星":"angry","雨伞":"surprised"};
var EYEFIX={heart:"starry",dizzy:"glass",crescent:"glass",droopy:"glass",wink:"glass",cat:"almond"};
var MOUTHOK={omega:1,smile:1,grin:1,fang:1,teeth:1,blep:1,pout:1,grass:1};
R.forEach(function(p){if(EYEFIX[p.eyes])p.eyes=EYEFIX[p.eyes];if(!MOUTHOK[p.mouth])p.mouth=p.species==="human"?"smile":"omega";if(["none","thin","normal","chubby"].indexOf(p.brows)<0)p.brows="normal";delete p.emote;delete p.expr;p.ex=EXMAP[p.name]||"neutral"});
var seed=11;function rnd(){seed=(seed*16807)%2147483647;return (seed-1)/2147483646}
function randomOne(r){r=r||Math.random;var pick=function(l){return l[Math.floor(r()*l.length)][0]};
 var sp=pick(SPECIES),hum=sp==="human",pal=sp==="squid"?SQUIDC:sp==="jelly"?JELLYC:hum?SKIN:FUR;
 var o=mk({species:sp,color:r()<.8&&!hum?SP[sp].c:pick(pal),face:pick(FACES),hair:pick(HAIRS),hairColor:pick(HAIRC),eyes:pick(EYES),eyeColor:pick(EYEC),brows:pick(BROWSTY.slice(1)),mouth:pick(MOUTHS),blush:pick(BLUSH.slice(1))});o.brows=pick(BROWSTY.slice(1));
 if(r()<.55)o.outfit.head=pick(ACCH.slice(1));if(r()<.35)o.outfit.neck=pick(ACCN.slice(1));if(r()<.15)o.outfit.face=pick(ACCF.slice(1));if(r()<.15)o.outfit.back=pick(ACCB.slice(1));if(r()<.25&&sp!=="squid"&&sp!=="jelly"&&sp!=="octopus")o.outfit.paws=1;
 if(r()<.3)o.marks=o.marks.concat([pick(MARKS)]);if(r()<.4)o.stickers=[pick(STICK)];if(r()<.3)o.shadow=pick(SHADOW.slice(1));o.idle=pick(IDLE);o.ex=pick(EXPL);o.brows=pick(BROWSTY.slice(1));
 return o}

function escAttr(value){return String(value == null ? "" : value).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function known(list,value,fallback){return list.some(function(x){return x[0]===value})?value:fallback}
function uniqueKnown(values,list){var seen={};return (Array.isArray(values)?values:[]).filter(function(value){if(seen[value]||!list.some(function(item){return item[0]===value}))return false;seen[value]=true;return true})}
function hex(value,fallback){var picked=/^#[0-9a-f]{6}$/i.test(value||"")?value:fallback;return picked?picked.toLowerCase():picked}
function supportsPaws(species){return ["squid","jelly","octopus"].indexOf(species)<0}
function fromRecipe(recipe){
 recipe=recipe||{};var species=known(SPECIES,recipe.species,"fox"),base=mk({species:species});
 var colors=recipe.colors||{},parts=recipe.parts||{},outfit=recipe.outfit||{};
 base.face=known(FACES,recipe.face,base.face);
 base.faceTone=known(SQFACE,recipe.face_tone,"skin");
 base.hair=known(HAIRS,recipe.hair,base.hair);
 base.color=hex(colors.base,base.color);
 base.hairColor=hex(colors.hair,base.hairColor);
 base.eyeColor=hex(colors.eye,base.eyeColor);
 base.eyes=known(EYES,parts.eye,base.eyes);
 base.brows=known(BROWSTY,parts.brow,base.brows);
 base.mouth=known(MOUTHS,parts.mouth,base.mouth);
 base.blush=known(BLUSH,parts.blush,base.blush);
 base.marks=Array.isArray(parts.marks)?uniqueKnown(parts.marks,MARKS):base.marks;
 base.stickers=Array.isArray(parts.stickers)?uniqueKnown(parts.stickers,STICK):base.stickers;
 base.shadow=known(SHADOW,parts.eyeshadow,base.shadow);
 base.ex=EXP[recipe.expression]?recipe.expression:base.ex;
 base.gloss=recipe.gloss!==false;
 base.idle=known(IDLE,recipe.idle,base.idle);
 ["head","face","neck","back"].forEach(function(slot){
  var sets={head:ACCH,face:ACCF,neck:ACCN,back:ACCB};
  base.outfit[slot]=known(sets[slot],outfit[slot]||"","");
  if(!base.outfit[slot])delete base.outfit[slot];
 });
 if(outfit.paws&&supportsPaws(species))base.outfit.paws=1;else delete base.outfit.paws;
 return base;
}
function toRecipe(state){
 var p=state&&state.species?state:fromRecipe(state),hum=p.species==="human",o=p.outfit||{};
 return {version:1,species:p.species,face:p.face||"round",face_tone:p.species==="squid"?(p.faceTone||"skin"):null,hair:hum?(p.hair||"long"):null,
  colors:{base:hex(p.color,null),hair:hum?hex(p.hairColor,null):null,eye:hex(p.eyeColor,null)},
  parts:{eye:p.eyes||"glass",brow:p.brows||"normal",mouth:p.mouth||"grin",blush:p.blush||"soft",
   marks:(p.marks||[]).slice(),stickers:(p.stickers||[]).slice(),eyeshadow:p.shadow||"none"},
  expression:EXP[p.ex]?p.ex:"neutral",gloss:p.gloss!==false,idle:known(IDLE,p.idle,"special"),
  outfit:{head:o.head||null,face:o.face||null,neck:o.neck||null,back:o.back||null,paws:supportsPaws(p.species)&&!!o.paws}};
}
function defaultRecipe(species){return toRecipe(mk({species:known(SPECIES,species,"fox"),eyes:"glass"}))}
function normalizeRecipe(recipe){return toRecipe(fromRecipe(recipe))}
function render(recipe,label,cls){
 var state=fromRecipe(recipe),classes="rj-character-avatar bub"+(cls?" "+String(cls).replace(/[^a-zA-Z0-9 _-]/g,""):"");
 return '<span class="'+classes+'">'+avatar(state,escAttr(label||"机机"))+"</span>";
}
var catalog={
 recipe_version:1,renderer_version:"v8-20260927",
 species:SPECIES.slice(),faces:FACES.slice(),face_tones:SQFACE.slice(),hairs:HAIRS.slice(),
 eyes:EYES.slice(),brows:BROWSTY.slice(),mouths:MOUTHS.slice(),blush:BLUSH.slice(),
 marks:MARKS.slice(),stickers:STICK.slice(),eyeshadows:SHADOW.slice(),expressions:EXPL.slice(),idle:IDLE.slice(),
 colors:{fur:FUR.slice(),skin:SKIN.slice(),hair:HAIRC.slice(),squid:SQUIDC.slice(),jelly:JELLYC.slice(),eye:EYEC.slice()},
 outfit:{head:ACCH.slice(),face:ACCF.slice(),neck:ACCN.slice(),back:ACCB.slice(),paws:[[false,"不要"],[true,"出镜"]]}
};
var presets=R.map(function(p){return {label:p.name,state:clone(p),recipe:toRecipe(p)}});
return {VERSION:"v8-20260927",catalog:catalog,presets:presets,render:render,renderSvg:function(recipe,label){return avatar(fromRecipe(recipe),escAttr(label||"机机"))},supportsPaws:supportsPaws,
 fromRecipe:fromRecipe,toRecipe:toRecipe,normalizeRecipe:normalizeRecipe,defaultRecipe:defaultRecipe,randomRecipe:function(random){return toRecipe(randomOne(random))}};
});
