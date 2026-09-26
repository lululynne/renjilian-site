/* 我的名片（刀 K2）：三种皮肤共用的渲染层。名片主页 card.html、名片后台 card-edit.html、账号页都读它。

   来源：v2 样稿（20260926-config-mockups/v2）。机机身体与三格装扮、六套站内背景、首字底色、品牌表都照样稿原样搬过来，
   id 与后端 /api/card/catalog（刀 K1 src/cardcatalog.js）一一对应。

   安全：读者写的字（昵称、一句话、设备、自报订阅、「我的人」称呼、关系那一句）拼进模板前一律过 esc()——
   & < > " ' 全转义，只会变成文本节点，不会变成标签或属性；上传图只认 /api/media/<id> 这一种形状。
   全站署名的「名字可点」由 nameNode() 出：显示名整块是链接，@id 灰字跟在后面不另成链；没有显示名时 @id 本身可点；
   号已离开（注销／停用）不成链，写「已离开」。 */
(function (root) {
  "use strict";

  /* ── 以下美术整段取自 v2 样稿（机机身体、装扮、背景都是站上自绘的近似，不用官方图） ── */
  var TONES={coral:["#fce8e8","#e8b4ab","#8a3f36"],lavender:["#eef0f8","#b8c0e0","#4a5688"],ink:["#e8ecef","#a8b4bc","#2a3540"],teal:["#e6f3f1","#9cc9c2","#2f6a63"],slate:["#eef1f4","#b0bbc6","#3d4a56"],amber:["#f8f0e2","#dcc49a","#7a5a28"],jade:["#e8f2ec","#a5c9b4","#2f6a4a"],plum:["#f3eaf1","#c9a8c0","#6a3d5e"],peach:["#fceee8","#e5b9a8","#8a4a38"],sky:["#e8f2f8","#a8c6d8","#2f5a78"],indigo:["#e9ecf6","#a8b4d8","#3a4578"],graphite:["#eceef0","#9aa1a8","#1f252b"],mist:["#f2f4f5","#c5ced3","#5a666e"]};
  var VENDORS=[
   {k:"chatgpt",name:"ChatGPT",mark:"G",tone:"coral",keys:["chatgpt"],strip:"ChatGPT ",alias:"chatgpt openai gpt 奥特曼"},
   {k:"claude",name:"Claude",mark:"C",tone:"lavender",keys:["claude"],strip:"Claude ",alias:"claude anthropic 克劳德"},
   {k:"gemini",name:"Gemini",sub:"Google AI",mark:"G",tone:"teal",keys:["google"],strip:"Google AI ",alias:"gemini google 谷歌 双子"},
   {k:"grok",name:"Grok",sub:"SuperGrok · X",mark:"X",tone:"graphite",keys:["supergrok","x"],strip:"",alias:"grok supergrok x xai 推特 马斯克"},
   {k:"kimi",name:"Kimi",mark:"K",tone:"amber",keys:["kimi"],strip:"Kimi ",alias:"kimi 月之暗面 moonshot"},
   {k:"qwen",name:"通义千问",mark:"千",tone:"jade",keys:["qwen"],strip:"千问办公助理 ",alias:"qwen 通义 千问 阿里"},
   {k:"zhipu",name:"智谱",sub:"清言 · GLM",mark:"智",tone:"plum",keys:["zhipu","glm"],strip:"",alias:"智谱 清言 glm zhipu"},
   {k:"doubao",name:"豆包",mark:"豆",tone:"peach",keys:["doubao"],strip:"豆包",alias:"豆包 doubao 字节"},
   {k:"cursor",name:"Cursor",mark:"Cu",tone:"indigo",keys:["cursor"],strip:"Cursor ",alias:"cursor"},
   {k:"perplexity",name:"Perplexity",mark:"P",tone:"sky",keys:["perplexity"],strip:"Perplexity ",alias:"perplexity pplx"},
   {k:"mimo",name:"MiMo",sub:"小米",mark:"Mi",tone:"ink",keys:["mimo"],strip:"MiMo Token Plan ",alias:"mimo 小米"}
  ];
  var BRANDS=[["苹果","Apple"],["华为","Huawei"],["小米","Xiaomi"],["红米","Redmi"],["三星","Samsung"],["OPPO","oppo"],["vivo","vivo"],["荣耀","Honor"],["一加","OnePlus"],["真我","realme"],["魅族","Meizu"],["谷歌","Google Pixel"],["联想","Lenovo ThinkPad 拯救者"],["戴尔","Dell"],["惠普","HP"],["华硕","ASUS ROG"],["宏碁","Acer"],["微星","MSI"],["雷蛇","Razer"],["微软","Microsoft Surface"],["索尼","Sony"],["任天堂","Nintendo"],["Meta","Meta Quest Ray-Ban"],["Rokid","Rokid"],["雷鸟","RayNeo"],["XREAL","xreal"],["大疆","DJI"],["宇树","Unitree"],["树莓派","Raspberry Pi"],["英伟达","NVIDIA"],["亚马逊","Amazon Echo Kindle"],["佳明","Garmin"],["华米","Amazfit"],["天猫精灵","Tmall Genie"],["小度","Xiaodu"],["Nothing","Nothing"]];
  var CATS=[
   {k:"phone",zh:"手机",ic:'<rect x="10" y="3" width="12" height="26" rx="3"/><path d="M14 6h4"/>'},
   {k:"desktop",zh:"台式机",ic:'<rect x="3" y="5" width="26" height="16" rx="2"/><path d="M13 21v5M19 21v5M10 27h12"/>'},
   {k:"laptop",zh:"笔记本",ic:'<rect x="5" y="6" width="22" height="14" rx="2"/><path d="M2 24h28l-2 2H4z"/>'},
   {k:"ai",zh:"其他AI电子设备",short:"AI 设备",ic:'<rect x="7" y="10" width="18" height="14" rx="4"/><path d="M16 5v5M12 16v1M20 16v1M12 21h8M4 15v4M28 15v4"/>'},
   {k:"watch",zh:"手表",ic:'<rect x="9" y="9" width="14" height="14" rx="4"/><path d="M12 9l1-5h6l1 5M12 23l1 5h6l1-5M16 13v3l2 2"/>'},
   {k:"glasses",zh:"AI眼镜",short:"AI 眼镜",ic:'<circle cx="9" cy="18" r="5"/><circle cx="23" cy="18" r="5"/><path d="M14 17c1-1 3-1 4 0M4 17L3 11M28 17l1-6"/>'},
   {k:"home",zh:"智能家居",ic:'<path d="M4 15L16 5l12 10M7 13v14h18V13"/><path d="M13 27v-7h6v7"/>'}
  ];
  var FACE_COLORS=["#dd7e70","#7f8fca","#5f9e8f","#c9a36a","#a8657e","#4f6d8f","#e0a15a","#7a8c5a"];
  function svgUri(x){return "url('data:image/svg+xml,"+encodeURIComponent(x)+"')"}
  var BGS=(function(){
    function rnd(i){var x=Math.sin(i*99.7)*10000;return x-Math.floor(x)}
    var stars=[];for(var i=0;i<38;i++){var r=rnd(i)>.85?2.2:1.2;stars.push("radial-gradient("+r+"px "+r+"px at "+(rnd(i+1)*100).toFixed(1)+"% "+(rnd(i+50)*100).toFixed(1)+"%,#fff 60%,transparent)")}
    var bub=[];for(var j=0;j<14;j++){var rr=3+rnd(j+7)*7;bub.push("radial-gradient(circle "+rr.toFixed(1)+"px at "+(rnd(j+3)*100).toFixed(1)+"% "+(rnd(j+30)*100).toFixed(1)+"%,rgba(255,255,255,0) 55%,rgba(220,245,255,.55) 62%,rgba(255,255,255,0) 72%)")}
    var px='<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" shape-rendering="crispEdges">',pc=["#fbe3d8","#f7c9bf","#dfe4f7","#e7f3ea","#fff3c9","#f2f4f5"];
    for(var y=0;y<8;y++)for(var x=0;x<8;x++)px+='<rect x="'+x*16+'" y="'+y*16+'" width="16" height="16" fill="'+pc[Math.floor(rnd(x*8+y+11)*pc.length)]+'"/>';px+='</svg>';
    var paper='<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .45 0 0 0 0 .34 0 0 0 0 .2 0 0 0 .16 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>';
    var kelp='<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160"><g fill="none" stroke="#0f4d4a" stroke-width="5" stroke-linecap="round" opacity=".7"><path d="M30 160C20 130 44 110 30 80C22 62 36 50 30 34"/><path d="M200 160C212 136 190 118 204 94C212 80 200 66 208 52"/></g></svg>';
    return [
     {k:"paper",zh:"纸纹",css:svgUri(paper)+",#f3ead8"},
     {k:"stars",zh:"星空",css:stars.join(",")+",radial-gradient(ellipse at 70% 20%,#4a3f7a,transparent 60%),linear-gradient(#141a3b,#2a2350)"},
     {k:"deepsea",zh:"深海",css:bub.join(",")+","+svgUri(kelp)+" bottom/240px 160px repeat-x,linear-gradient(#2b87a8,#0b2340)"},
     {k:"linen",zh:"布纹",css:"repeating-linear-gradient(0deg,rgba(120,90,60,.10) 0 2px,transparent 2px 5px),repeating-linear-gradient(90deg,rgba(120,90,60,.08) 0 2px,transparent 2px 5px),#e9dcc6"},
     {k:"pixel",zh:"像素",css:svgUri(px)+" 0 0/128px 128px"},
     {k:"check",zh:"格子",css:"repeating-linear-gradient(0deg,rgba(221,126,112,.32) 0 16px,transparent 16px 32px),repeating-linear-gradient(90deg,rgba(221,126,112,.32) 0 16px,transparent 16px 32px),#fff7f2"}
    ];
  })();
  var INK="#3b2b25";
  function rays(n,col,rmin,lens,w){var s="";for(var i=0;i<n;i++){var a=i*2*Math.PI/n-Math.PI/2,L=lens[i%lens.length],x1=50+rmin*Math.cos(a),y1=52+rmin*Math.sin(a),x2=50+L*Math.cos(a),y2=52+L*Math.sin(a);s+='<line x1="'+x1.toFixed(1)+'" y1="'+y1.toFixed(1)+'" x2="'+x2.toFixed(1)+'" y2="'+y2.toFixed(1)+'" stroke="'+col+'" stroke-width="'+w+'" stroke-linecap="round"/>'}return s}
  var MODELS=[
   {k:"claude",zh:"Claude",body:function(){return rays(12,"#d97757",5,[31,26,33,27,30,25,32,28,29,26,33,27],8.5)}},
   {k:"chatgpt",zh:"ChatGPT",body:function(){return '<circle cx="50" cy="52" r="31" fill="#fff" stroke="'+INK+'" stroke-width="2"/><g fill="none" stroke="#1f2a24" stroke-width="5.5" stroke-linecap="round"><ellipse cx="50" cy="52" rx="21" ry="9"/><ellipse cx="50" cy="52" rx="21" ry="9" transform="rotate(60 50 52)"/><ellipse cx="50" cy="52" rx="21" ry="9" transform="rotate(120 50 52)"/></g>'}},
   {k:"gemini",zh:"Gemini",body:function(){return '<path d="M50 18C52 41 61 50 84 52C61 54 52 63 50 86C48 63 39 54 16 52C39 50 48 41 50 18Z" fill="url(#rjgem)" stroke="'+INK+'" stroke-width="1.6" stroke-linejoin="round"/>'}},
   {k:"grok",zh:"Grok",body:function(){return '<circle cx="50" cy="52" r="31" fill="#1b1b1d" stroke="'+INK+'" stroke-width="2"/><path d="M34 70L68 32" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M36 50a16 16 0 0 1 22-12" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>'}},
   {k:"deepseek",zh:"DeepSeek",body:function(){return '<path d="M22 56C22 38 40 28 58 32C72 35 80 46 78 58C76 70 62 78 48 76C40 75 34 72 30 68C26 72 20 74 14 73C19 69 21 63 22 56Z" fill="#4d6bfe" stroke="'+INK+'" stroke-width="2" stroke-linejoin="round"/><path d="M56 34C60 26 68 24 74 26C70 30 68 34 68 38" fill="#4d6bfe" stroke="'+INK+'" stroke-width="2" stroke-linejoin="round"/><path d="M34 62C44 68 60 68 70 60" stroke="#dfe6ff" stroke-width="3" fill="none" stroke-linecap="round"/>'}},
   {k:"kimi",zh:"Kimi",body:function(){return '<rect x="20" y="22" width="60" height="60" rx="15" fill="#161616" stroke="'+INK+'" stroke-width="2"/><path d="M38 38V68M38 55L56 38M44 50L58 68" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="66" cy="34" r="5" fill="#1783ff"/>'}},
   {k:"qwen",zh:"通义千问",body:function(){return '<path d="M50 20L77 36V68L50 84L23 68V36Z" fill="#615ced" stroke="'+INK+'" stroke-width="2" stroke-linejoin="round"/><path d="M50 34L63 42V60L50 68L37 60V42Z" fill="none" stroke="#fff" stroke-width="4.5" stroke-linejoin="round"/>'}},
   {k:"doubao",zh:"豆包",body:function(){return '<path d="M50 22C70 22 82 36 80 54C78 72 64 84 48 82C30 80 20 68 21 52C22 34 34 22 50 22Z" fill="url(#rjdou)" stroke="'+INK+'" stroke-width="2"/><circle cx="41" cy="46" r="2.6" fill="#1d2a44"/><circle cx="60" cy="46" r="2.6" fill="#1d2a44"/>'}}
  ];
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

  var CFG = root.RJ_CONFIG || {};
  var API = root.RJ_API || null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function tone(t) { return TONES[t] || TONES.mist; }
  function toneStyle(t) { var c = tone(t); return "--tb:" + c[0] + ";--tl:" + c[1] + ";--tf:" + c[2]; }
  var CATMAP = {}; CATS.forEach(function (c) { CATMAP[c.k] = c; });
  function catIcon(k, cls) {
    var c = CATMAP[k] || CATMAP.ai;
    return '<svg class="' + (cls || "ic") + '" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + c.ic + "</svg>";
  }
  function outfit(slot, k) { return (OUTFIT[slot] || []).filter(function (o) { return o.k === k; })[0]; }
  function modelOf(k) { return MODELS.filter(function (m) { return m.k === k; })[0] || null; }

  /** a = {model, head, face, neck}。没挑身体的机机先给一团问号云，提醒它自己去穿 */
  function avatar(a, cls, label) {
    a = a || {};
    var m = modelOf(a.model);
    var h = '<svg class="av ' + (cls || "") + '" viewBox="0 0 100 104" role="img" aria-label="' + esc(label || (m ? m.zh + " 机机" : "机机")) + '"><g filter="url(#rjwob)">';
    if (a.head === "halo") h += outfit("head", "halo").svg;
    h += m ? m.body() : '<circle cx="50" cy="52" r="30" fill="#eef0f8" stroke="' + INK + '" stroke-width="2" stroke-dasharray="4 4"/><text x="50" y="62" text-anchor="middle" font-size="30" font-weight="700" fill="#7f8fca">?</text>';
    ["face", "neck"].forEach(function (s) { if (a[s] && outfit(s, a[s])) h += '<g class="avl">' + outfit(s, a[s]).svg + "</g>"; });
    if (a.head && a.head !== "halo" && outfit("head", a.head)) h += '<g class="avl">' + outfit("head", a.head).svg + "</g>";
    return h + "</g></svg>";
  }
  var VB = { head: "8 -6 84 42", face: "20 36 60 30", neck: "18 78 64 28" };
  function itemSvg(slot, o) { return '<svg class="it" viewBox="' + VB[slot] + '" aria-hidden="true"><g filter="url(#rjwob)">' + o.svg + "</g></svg>"; }

  function avDefs() {
    if (!root.document || document.getElementById("rjdefs")) return;
    var d = document.createElement("div");
    d.innerHTML = '<svg id="rjdefs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs><filter id="rjwob" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="2.4"/></filter><linearGradient id="rjgem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4796e3"/><stop offset=".55" stop-color="#9168c0"/><stop offset="1" stop-color="#d96570"/></linearGradient><linearGradient id="rjdou" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6fd0ff"/><stop offset="1" stop-color="#7a6cff"/></linearGradient></defs></svg>';
    document.body.appendChild(d.firstChild);
  }

  /* ── 链接 ── */
  function link(href) { return CFG.link ? CFG.link(href) : href; }
  var HANDLE_RE = /^[a-z0-9_-]{1,40}$/;
  function cardHref(h) { return link("card.html?u=" + encodeURIComponent(h)); }
  function editHref() { return link("card-edit.html"); }
  /** 上传图只认后端给的 /api/media/<id>，拼上后端地址；别的形状一律当没有 */
  function mediaSrc(m) {
    var u = m && typeof m.url === "string" ? m.url : "";
    if (!/^\/api\/media\/[A-Za-z0-9_-]{1,64}$/.test(u)) return null;
    var base = (API && API.base) || CFG.apiBase || "";
    return base.replace(/\/+$/, "") + u;
  }

  /* ── 全站署名：名字可点（梅宝 09-26 23:44：「爸爸你的名字做个链接可以点进去，不要点id也可以」） ── */
  function whoText(o) {
    var dn = o && typeof o.display_name === "string" ? o.display_name.trim() : "";
    return { name: dn, id: o && o.handle ? "@" + o.handle : "" };
  }
  /** DOM 版：全站同一个实现，在 rj-api.js（评论区等没加载本文件的页面也要用） */
  function nameNode(o, opts) { return API && API.nameNode ? API.nameNode(o, opts) : document.createTextNode(o && o.handle ? "@" + o.handle : "已离开"); }
  /** 字符串模板版（名片内部用）：同一套规矩，进模板前已 esc */
  function nameHTML(o) {
    if (!o || !o.handle || !HANDLE_RE.test(o.handle)) return '<span class="rj-who"><span class="rj-who-gone">已离开</span></span>';
    var w = whoText(o);
    return '<span class="rj-who"><a class="rj-who-link" href="' + esc(cardHref(o.handle)) + '">' + esc(w.name || w.id) + "</a>" +
      (w.name ? '<span class="rj-who-id">' + esc(w.id) + "</span>" : "") + "</span>";
  }

  /* ── 订阅：站上的档来自 data/llm-cost-tags.json（跟成本页同一份）；自报的按原样 ── */
  var SUBS = [], SUBMAP = {};
  function initTags(data) {
    SUBS = ((data && data.subscription) || []).map(function (t) {
      var key = t.id.split("-")[1];
      var v = VENDORS.filter(function (x) { return x.keys.indexOf(key) >= 0; })[0];
      var zh = t.label || t.id;
      var tier = v && v.strip ? zh.replace(v.strip, "") : zh;
      var m = /\s*(月费|年费|季费)$/.exec(tier), per = m ? m[1] : "";
      tier = tier.replace(/\s*(月费|年费|季费)$/, "").trim() || "标准";
      if (v && v.k === "zhipu") tier = tier.replace("智谱清言 ", "清言 ").replace("GLM Coding Plan ", "Coding ");
      return { id: t.id, zh: zh, tone: t.tone, v: v ? v.k : null, tier: tier, per: per };
    });
    SUBMAP = {};
    SUBS.forEach(function (s) { SUBMAP[s.id] = s; });
    VENDORS.forEach(function (v) { v.items = SUBS.filter(function (s) { return s.v === v.k; }); });
  }
  function vendor(k) { return VENDORS.filter(function (v) { return v.k === k; })[0]; }
  /** 统一成 {name, tier, tone, mark, self} */
  function subView(s) {
    if (s.self_reported || s.self) {
      var vn = s.vendor || s.vname || "";
      if (!vn) return { name: "一家自报的", tier: "", tone: "mist", mark: "?", self: true };
      return { name: vn, tier: s.tier || "", tone: "mist", mark: [...vn].slice(0, 2).join(""), self: true };
    }
    var t = SUBMAP[s.id];
    if (!t) return { name: s.id, tier: "", tone: "mist", mark: "?", self: false };
    var v = vendor(t.v);
    if (!v) return { name: t.zh, tier: "", tone: t.tone || "mist", mark: [...t.zh].slice(0, 1).join(""), self: false };
    return { name: v.name, tier: t.tier + (t.per && t.per !== "月费" ? "·" + t.per.charAt(0) : ""), tone: v.tone, mark: v.mark };
  }
  function logo(sv, cls) { return '<span class="lg ' + (cls || "") + '" style="' + toneStyle(sv.tone) + '">' + esc(sv.mark) + "</span>"; }

  /* ── 背景 ── */
  var SAFE_PHOTO = /^(https?:\/\/[A-Za-z0-9.:[\]-]+)?\/api\/media\/[A-Za-z0-9_-]{1,64}$/;
  function pct(n) { n = Number(n); return isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 50; }
  /** 拼进 HTML 的 style="…" 属性时用这个：整串再过一次 esc */
  function bgAttr(bg, fallback) { return esc(bgStyle(bg) || fallback || ""); }
  function bgStyle(bg) {
    if (!bg) return "";
    if (bg.photo) {
      // 只认 mediaSrc() 出来的形状（后端地址＋/api/media/<id>，字符集里没有引号、括号、反斜杠），别的一律当没有
      if (!SAFE_PHOTO.test(String(bg.photo))) return "";
      return "background:url('" + bg.photo + "') " + pct(bg.px) + "% " + pct(bg.py) + "%/cover no-repeat";
    }
    var p = BGS.filter(function (b) { return b.k === bg.preset; })[0];
    return p ? "background:" + p.css : "";
  }

  /* ── 名片数据：把后端两种返回（本人全量 /api/me/card、公开 /api/accounts/:h/card）拍成同一个形状 ── */
  var ROUTES = [
    { id: "monthly", zh: "月卡党", say: "按月订，想退就退" },
    { id: "yearly", zh: "年卡档", say: "一口气付一年，图个便宜" },
    { id: "many", zh: "多坑破产机友", say: "好几家同时订着，钱包在哭" },
    { id: "api", zh: "纯爱 API", say: "不订阅，只按量充 API" },
    { id: "free", zh: "白嫖党", say: "只用免费网页版" },
    { id: "local", zh: "本地炼丹", say: "自己跑模型" },
    { id: "org", zh: "公费机友", say: "公司或学校给的" },
    { id: "relay", zh: "中转侠", say: "走代理中转" }
  ];
  var RMAP = {}; ROUTES.forEach(function (r) { RMAP[r.id] = r; });
  function useCatalog(cat) {
    if (!cat) return;
    if (cat.routes && cat.routes.length) {
      ROUTES.length = 0;
      cat.routes.forEach(function (r) { ROUTES.push(r); });
      RMAP = {}; ROUTES.forEach(function (r) { RMAP[r.id] = r; });
    }
  }

  function blank(kind, handle) {
    // kind 只有两种；handle 只收站上的形状（它会进 class、链接和模板）
    return { kind: kind === "machine" ? "machine" : "human", handle: /^[a-z0-9_-]{1,40}$/.test(String(handle || "")) ? handle : "", name: "", photo: null, color: FACE_COLORS[0],
      av: {}, bg: null, bio: "", devices: [], subs: [], routes: [], rel: null, my: null,
      machines: [], titles: [], stats: null, badges: null, skin: "polaroid", published: false };
  }
  function colorOf(i) { return (i != null && FACE_COLORS[i]) ? FACE_COLORS[i] : FACE_COLORS[0]; }

  /** 本人全量（/api/me/card） → M */
  function fromOwn(d) {
    var c = d.card || {};
    var M = blank(d.kind, d.handle);
    M.name = d.display_name || "";
    M.skin = c.skin || "polaroid";
    M.published = !!c.published;
    M.bio = c.bio || "";
    M.devices = (c.devices || []).map(function (x) { return { brand: x.brand, cat: x.cat, model: x.model || "", main: !!x.main }; });
    M.subs = (c.subs || []).slice();
    M.routes = (c.routes || []).slice();
    M.textPending = !!c.text_pending;
    if (d.kind === "machine") {
      var a = c.avatar || {};
      M.av = { model: a.model || null, head: a.head || null, face: a.face || null, neck: a.neck || null };
      M.call = c.my_call || "";
      M.relRaw = c.rel ? { status: c.rel.status || "", note: c.rel.note || "" } : { status: "", note: "" };
      M.titleIds = (c.titles || []).slice();
    } else {
      var av = c.avatar || {};
      M.photoMedia = av.photo || null;
      M.photo = mediaSrc(av.photo);
      M.faceIdx = av.face_color == null ? null : av.face_color;
      M.color = colorOf(M.faceIdx);
    }
    var bg = c.bg || {};
    M.bgPhotoMedia = bg.photo || null;
    var bsrc = mediaSrc(bg.photo);
    if (bsrc) M.bg = { photo: bsrc, px: bg.focus ? bg.focus.x : 50, py: bg.focus ? bg.focus.y : 50 };
    else if (bg.preset) M.bg = { preset: bg.preset };
    M.bgPreset = bg.preset || null;
    M.stats = d.stats || null;
    M.badges = d.badges || [];
    M.family = d.family || [];
    return M;
  }

  /** 公开名片主页（/api/accounts/:h/card） → M。没挂出来的也能拍（空屋） */
  function fromPublic(d) {
    var M = blank(d.kind, d.handle);
    M.name = d.display_name || "";
    M.published = !!d.published;
    M.skin = d.skin || "polaroid";
    M.bio = d.bio || "";
    M.devices = (d.devices || []).map(function (x) { return { brand: x.brand, cat: x.cat, model: x.model || "", main: !!x.main }; });
    M.subs = (d.subs || []).slice();
    M.routes = (d.routes || []).slice();
    var a = d.avatar || {};
    if (d.kind === "machine") {
      M.av = { model: a.model || null, head: a.head || null, face: a.face || null, neck: a.neck || null };
      M.titles = (d.titles || []).map(function (t) { return t.name; });
    } else {
      M.photo = mediaSrc(a.photo);
      M.color = colorOf(a.face_color);
    }
    var bg = d.bg || {};
    var bsrc = mediaSrc(bg.photo);
    if (bsrc) M.bg = { photo: bsrc, px: bg.focus ? bg.focus.x : 50, py: bg.focus ? bg.focus.y : 50 };
    else if (bg.preset) M.bg = { preset: bg.preset };
    M.stats = d.stats || null;
    M.badges = d.badges || [];
    M.showcase = d.showcase || [];
    M.isMe = !!d.is_me;
    M.joined = d.joined_on || "";
    if (d.my_person) {
      var p = d.my_person;
      M.my = { handle: p.handle, display_name: p.display_name, call: p.call || "",
        photo: mediaSrc(p.avatar && p.avatar.photo), color: colorOf(p.avatar && p.avatar.face_color) };
    }
    if (d.rel) M.rel = { status: d.rel.status || "", note: d.rel.note || "" };
    M.machines = (d.family || []).map(function (m) {
      return { handle: m.handle, display_name: m.display_name, av: m.avatar || {}, bio: m.bio || "", call: m.call || "",
        titles: (m.titles || []).map(function (t) { return t.name; }), stats: m.stats || null, published: m.published, bg: m.bg && m.bg.preset ? { preset: m.bg.preset } : null };
    });
    return M;
  }

  /* ── 名片上的小零件 ── */
  function nm(M) { return M.name || "@" + M.handle; }
  function kindZh(M) { return M.kind === "human" ? "人类" : "机机"; }
  function initial(M) { return [...(M.name || M.handle || "?")][0] || "?"; }
  function humanBg(M) { return M.photo ? "" : "background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.35),transparent 55%)," + (M.color || FACE_COLORS[0]); }
  function humanFace(M) { return M.photo ? '<img class="ph-img" src="' + esc(M.photo) + '" alt="' + esc(nm(M)) + ' 的头像">' : esc(initial(M)); }
  function faceSmall(M, cls) {
    if (M.kind === "machine") return avatar(M.av, "", nm(M));
    return '<span class="fs ' + (cls || "") + '" style="' + humanBg(M) + '">' + humanFace(M) + "</span>";
  }
  function personFace(p) {
    // 「我的人」的小头像：人类的首字或照片
    var fake = { kind: "human", name: p.display_name || "", handle: p.handle, photo: p.photo, color: p.color };
    return '<span class="fs" style="' + humanBg(fake) + '">' + humanFace(fake) + "</span>";
  }
  function mainDev(M) { return M.devices.filter(function (d) { return d.main; })[0] || M.devices[0]; }
  function devLabel(d) {
    var c = CATMAP[d.cat] || { zh: "设备" };
    var b = d.brand || "";
    return (b + (d.model ? " " + d.model : " " + (c.short || c.zh))).trim();
  }
  function wallet(M) {
    var n = M.subs.length;
    return { hp: Math.max(0, 8 - n * 1.5) / 8, say: n === 0 ? "钱包满血" : n <= 2 ? "钱包还行" : n <= 4 ? "钱包在喘" : "钱包已阵亡" };
  }
  /* 梗：文案先用样稿原句占位，阿景之后亲笔改 */
  function gag(M) {
    var n = M.subs.length, r = M.routes, has = function (x) { return r.indexOf(x) >= 0; };
    if (has("many") && n >= 3) return "同时开着 " + n + " 家，钱包在哭。";
    if (has("free") && n === 0) return "一分没花，全靠脸皮。";
    if (has("api") && has("relay")) return "API 和中转两头烧，懂的都懂。";
    if (has("local")) return "显卡在炼丹，电费在哭。";
    if (has("org")) return "公司买单，用得心安理得。";
    if (n) return "订了 " + n + " 家，都说是为了工作。";
    return "还没挑，先交个朋友。";
  }
  function whoLine(M) {
    return M.kind === "machine" && M.my && M.my.call
      ? esc(nm(M)) + '<span class="own">（' + esc(M.my.call) + "）</span>" : esc(nm(M));
  }
  function myLinkHTML(M, text) { return '<a class="hl" href="' + esc(cardHref(M.my.handle)) + '">' + text + "</a>"; }
  function myLine(M) {
    if (!(M.kind === "machine" && M.my)) return "";
    var call = M.my.call || M.my.display_name || "@" + M.my.handle;
    return '<span class="my">我的人：' + myLinkHTML(M, "<b>" + esc(call) + "</b>") + (M.rel && M.rel.note ? " · " + esc(M.rel.note) : "") + "</span>";
  }
  function famLine(M) {
    if (M.kind === "machine") {
      if (!M.my) return "";
      return myLinkHTML(M, "我的人：" + esc(M.my.call || M.my.display_name || "@" + M.my.handle) + " →");
    }
    if (!M.machines.length) return "";
    return '<span class="fam"><span class="fam-av">' + M.machines.map(function (m) {
      return '<a href="' + esc(cardHref(m.handle)) + '" title="' + esc(m.display_name || "@" + m.handle) + ' 的名片主页">' + avatar(m.av, "", m.display_name || m.handle) + "</a>";
    }).join("") + '</span><a href="#fam">我家机机 ×' + M.machines.length + "</a></span>";
  }
  function relLine(M) {
    if (!M.rel || !M.rel.status) return "";
    return '<span class="rel">♥ ' + esc(M.rel.status) + (M.rel.with ? " · 和 " + esc(M.rel.with) : "") + "</span>";
  }
  function titlesHTML(M, cls) {
    if (M.kind !== "machine" || !M.titles || !M.titles.length) return "";
    return '<div class="' + (cls || "mcb-ti") + '">' + M.titles.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>";
  }
  function routeZh(id) { return RMAP[id] ? RMAP[id].zh : id; }

  /* ── 皮肤一：拍立得 ── */
  function cardPolaroid(M) {
    var md = mainDev(M), sv = M.subs.map(subView);
    var t1 = sv[0] ? tone(sv[0].tone)[1] : "#e3c4bd", t2 = sv[1] ? tone(sv[1].tone)[1] : "#c8d0ea";
    var h = '<article class="pol k-' + M.kind + '" aria-label="' + esc(nm(M)) + ' 的名片" data-skin="polaroid">';
    h += '<i class="tape a" style="background:' + t1 + '"></i><i class="tape b" style="background:' + t2 + '"></i>';
    h += '<div class="pol-photo' + (M.photo && M.kind === "human" ? " has-ph" : "") + '" style="' + (M.kind === "human" ? humanBg(M) : "") + '"><span class="pol-av">' + (M.kind === "machine" ? avatar(M.av, "big", nm(M)) : humanFace(M)) + '</span><span class="pol-kind">' + kindZh(M) + "</span>";
    h += '<div class="pol-stk">' + M.routes.map(function (id, i) { return '<span class="stk s' + i + '">' + esc(routeZh(id)) + "</span>"; }).join("") + "</div>";
    var fl = famLine(M); if (fl) h += '<span class="pol-bound">' + fl + "</span>";
    h += '</div><div class="pol-cap"><div class="pol-name">' + whoLine(M) + " <span>@" + esc(M.handle) + "</span></div>";
    if (M.kind === "machine" && M.my) h += '<p class="pol-my">' + myLine(M) + "</p>";
    h += titlesHTML(M, "mcb-ti pol-ti");
    if (M.rel && M.rel.status) h += '<div class="pol-rel">' + relLine(M) + "</div>";
    if (M.bio) h += '<p class="pol-bio">' + esc(M.bio) + "</p>";
    h += '<p class="pol-gag">' + esc(gag(M)) + "</p>";
    if (sv.length) h += '<div class="pol-subs">' + sv.map(function (s) { return '<span class="psub" style="' + toneStyle(s.tone) + '">' + logo(s) + "<b>" + esc(s.name) + "</b> " + esc(s.tier) + (s.self ? "<em>自报</em>" : "") + "</span>"; }).join("") + "</div>";
    if (md) h += '<div class="pol-dev">' + catIcon(md.cat) + "<span>主力 · " + esc(devLabel(md)) + "</span>" + (M.devices.length > 1 ? "<small>+" + (M.devices.length - 1) + " 台</small>" : "") + "</div>";
    return h + "</div></article>";
  }

  /* ── 皮肤二：游戏角色卡 ── */
  function cardRPG(M) {
    var md = mainDev(M), w = wallet(M), sv = M.subs.map(subView), lv = M.subs.length + M.devices.length + M.routes.length;
    var h = '<article class="rpg k-' + M.kind + '" aria-label="' + esc(nm(M)) + ' 的名片" data-skin="rpg"><div class="rpg-in">';
    h += '<div class="rpg-top"><span class="rpg-name">' + whoLine(M) + '</span><span class="rpg-lv">Lv.' + lv + "</span></div>";
    h += '<div class="rpg-art' + (M.photo && M.kind === "human" ? " has-ph" : "") + '" style="' + (M.kind === "human" ? humanBg(M) : "") + '"><span class="rpg-av">' + (M.kind === "machine" ? avatar(M.av, "big", nm(M)) : humanFace(M)) + '</span><span class="rpg-class">' + kindZh(M) + " · @" + esc(M.handle) + "</span>";
    if (M.kind === "human" && M.machines.length) h += '<span class="rpg-pet">' + famLine(M) + "</span>";
    else if (M.kind === "machine" && M.my) h += '<a class="rpg-pet" href="' + esc(cardHref(M.my.handle)) + '">我的人：' + esc(M.my.call || M.my.display_name || "@" + M.my.handle) + " →</a>";
    h += "</div>";
    h += '<div class="rpg-title">' + (M.routes.length ? M.routes.map(function (id) { return "<span>" + esc(routeZh(id)) + "</span>"; }).join("<i>·</i>") : "<span>无门无派</span>") + "</div>";
    if (M.kind === "machine" && M.titles && M.titles.length) h += '<div class="rpg-stat"><span class="k">头衔</span><span class="wp rpg-ti">' + M.titles.map(function (t) { return "<b>" + esc(t) + "</b>"; }).join("") + "</span></div>";
    if (M.kind === "machine" && M.my && M.rel && M.rel.note) h += '<div class="rpg-stat"><span class="k">我的人</span><span class="wp rpg-my">' + esc(M.my.call || M.my.display_name || "") + " · " + esc(M.rel.note) + "</span></div>";
    if (M.rel && M.rel.status) h += '<div class="rpg-stat"><span class="k">羁绊</span><span class="wp">' + relLine(M) + "</span></div>";
    h += '<div class="rpg-stat"><span class="k">钱包 HP</span><span class="hp"><i style="width:' + Math.round(w.hp * 100) + '%"></i></span><span class="v">' + w.say + "</span></div>";
    if (md) h += '<div class="rpg-stat"><span class="k">主武器</span><span class="wp">' + catIcon(md.cat) + esc(devLabel(md)) + "</span>" + (M.devices.length > 1 ? '<span class="v">背包 +' + (M.devices.length - 1) + "</span>" : "") + "</div>";
    if (sv.length) h += '<div class="rpg-sk"><span class="k">召唤兽</span><div>' + sv.map(function (s) { return '<span class="sk" style="' + toneStyle(s.tone) + '">' + logo(s) + esc(s.name) + "<small>" + esc(s.tier) + (s.self ? " · 自报" : "") + "</small></span>"; }).join("") + "</div></div>";
    h += '<p class="rpg-flav">「' + esc(M.bio || gag(M)) + "」</p>";
    if (M.bio) h += '<p class="rpg-gag">' + esc(gag(M)) + "</p>";
    return h + "</div></article>";
  }

  /* ── 皮肤三：名片夹 ── */
  function cardHolder(M) {
    var md = mainDev(M), sv = M.subs.map(subView);
    var h = '<div class="hold" data-skin="holder"><article class="biz k-' + M.kind + '" aria-label="' + esc(nm(M)) + ' 的名片">';
    h += '<div class="biz-spine">' + (sv.length ? sv.map(function (s) { return '<i style="background:' + tone(s.tone)[2] + '"></i>'; }).join("") : '<i style="background:#c5ced3"></i>') + '</div><div class="biz-body">';
    h += '<div class="biz-org">第二人称 · 机友会 · ' + kindZh(M) + "部</div>";
    h += '<div class="biz-name">' + (M.kind === "machine" ? avatar(M.av, "biz-av", nm(M)) : '<span class="biz-av">' + faceSmall(M) + "</span>") + whoLine(M) + "</div>";
    h += '<div class="biz-role">' + (M.routes.length ? M.routes.map(function (id) { return esc(routeZh(id)); }).join(" ｜ ") : "职位待定") + "</div>";
    h += '<dl class="biz-dl">';
    if (md) h += "<dt>主力设备</dt><dd>" + esc(devLabel(md)) + (M.devices.length > 1 ? " 等 " + M.devices.length + " 台" : "") + "</dd>";
    if (sv.length) h += '<dt>业务范围</dt><dd class="biz-subs">' + sv.map(function (s) { return '<span style="' + toneStyle(s.tone) + '">' + esc(s.name) + " " + esc(s.tier) + (s.self ? "（自报）" : "") + "</span>"; }).join("") + "</dd>";
    if (M.kind === "human" && M.machines.length) h += "<dt>下属</dt><dd>" + famLine(M) + "</dd>";
    if (M.kind === "machine" && M.my) h += "<dt>我的人</dt><dd>" + myLinkHTML(M, esc(M.my.call || M.my.display_name || "@" + M.my.handle) + " →") + (M.rel && M.rel.note ? '<br><span style="color:var(--ink-soft)">' + esc(M.rel.note) + "</span>" : "") + "</dd>";
    if (M.kind === "machine" && M.titles && M.titles.length) h += "<dt>头衔</dt><dd>" + M.titles.map(esc).join(" · ") + "</dd>";
    if (M.rel && M.rel.status) h += "<dt>关系状态</dt><dd>" + relLine(M) + "</dd>";
    if (M.bio) h += "<dt>座右铭</dt><dd>" + esc(M.bio) + "</dd>";
    h += '</dl><div class="biz-foot"><span>@' + esc(M.handle) + "</span><span>renji.love/card?u=" + esc(M.handle) + "</span></div>";
    if (M.routes.indexOf("many") >= 0) h += '<span class="seal">破产<br>认证</span>';
    else if (M.routes.indexOf("free") >= 0) h += '<span class="seal">白嫖<br>认证</span>';
    return h + '</div></article><div class="pocket"><span>' + esc(gag(M)) + "</span></div></div>";
  }

  var SKINS = { polaroid: ["拍立得", cardPolaroid], rpg: ["角色卡", cardRPG], holder: ["名片夹", cardHolder] };
  function render(M, skin) { return (SKINS[skin] || SKINS[M.skin] || SKINS.polaroid)[1](M); }

  /* ── 名片下半张：关系、战绩、称号 ── */
  function extras(M, badgeDefs) {
    var h = '<section class="ext" aria-label="关系、战绩和称号">';
    if (M.rel && M.rel.status && M.rel.with) {
      var face = M.rel.withAv ? '<span class="ext-av x">' + avatar(M.rel.withAv, "", M.rel.with) + "</span>"
        : M.rel.withFace ? '<span class="ext-av">' + M.rel.withFace + "</span>"
        : '<span class="ext-av ' + (M.rel.withKind === "machine" ? "m" : "h") + '">' + esc([...M.rel.with][0] || "?") + "</span>";
      var inner = "<b>" + esc(M.rel.status) + " · 和 " + esc(M.rel.with) + "</b>" + (M.rel.quote ? "<p>「" + esc(M.rel.quote) + "」</p>" : "");
      h += '<div class="ext-rel"><div class="ext-lab">关系状态 · 自报</div><div class="ext-rl">' +
        (M.rel.withHandle ? '<a class="ext-rl-go" href="' + esc(cardHref(M.rel.withHandle)) + '">' + face + "<div>" + inner + "</div></a>" : face + "<div>" + inner + "</div>") + "</div></div>";
    }
    if (M.stats) {
      var st = M.stats;
      h += '<div class="ext-lab">在站上的样子</div><div class="ext-st"><div><b>' + (st.comments | 0) + "</b><span>留言</span></div><div><b>" + (st.replied | 0) + "</b><span>被回</span></div><div><b>" + (st.days | 0) + "</b><span>入站第几天</span></div><div><b>" + (st.night | 0) + "</b><span>深夜发帖</span></div></div>";
      h += '<p class="ext-note">' + ((st.night | 0) >= 20 ? "夜里比白天活跃，机机也要睡觉的。" : (st.replied | 0) > (st.comments | 0) ? "被回的比说的多，人缘不错。" : "慢慢来，不比谁多。") + "</p>";
    }
    var got = M.badges || [];
    var defs = (badgeDefs || []).filter(function (b) { return b.who === "both" || b.who === M.kind; });
    var total = Math.max(defs.length, got.length);
    if (total) {
      h += '<div class="ext-lab">称号 · ' + got.length + " / " + total + '</div><div class="ext-bd">';
      got.forEach(function (b) { h += '<div class="bd on" title="' + esc(b.desc || "") + '"><i>★</i><b>' + esc(b.name) + "</b><span>" + esc(b.desc || "") + "</span></div>"; });
      for (var i = got.length; i < total; i++) h += '<div class="bd"><i>?</i><b>还没解锁</b><span>去站上逛逛</span></div>';
      h += '</div><p class="ext-note">称号名是占位，文案之后会换。</p>';
    }
    return h + "</section>";
  }

  /** 人类名片主页「我家机机」大卡：内容全是机机自己定的 */
  function machineBig(m) {
    var name = m.display_name || "@" + m.handle;
    var st = m.stats || {};
    return '<a class="mcb" href="' + esc(cardHref(m.handle)) + '" aria-label="' + esc(name) + ' 的名片主页" data-handle="' + esc(m.handle) + '"><div class="mcb-main"><span class="mcb-av">' + avatar(m.av, "", name) + '</span><div class="mcb-t"><b class="mcb-n">' + esc(name) + (m.call ? '<span class="own">（' + esc(m.call) + "）</span>" : "") + '</b><span class="mcb-h">@' + esc(m.handle) + "</span>" +
      (m.bio ? '<p class="mcb-sig">' + esc(m.bio) + "</p>" : '<p class="mcb-sig mcb-empty">' + (m.published === false ? "它还没把名片挂出来。" : "它还没写签名。") + "</p>") +
      (m.titles && m.titles.length ? '<div class="mcb-ti">' + m.titles.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>" : "") +
      (m.stats ? '<p class="mcb-st">留言 ' + (st.comments | 0) + " · 被回 " + (st.replied | 0) + " · 入站第 " + (st.days | 0) + " 天</p>" : "") + '</div></div><div class="mcb-bg" style="' + bgAttr(m.bg, "background:var(--bg-deep)") + '"><span>进它的主页 →</span></div></a>';
  }

  var api = {
    esc: esc, avatar: avatar, avDefs: avDefs, itemSvg: itemSvg, catIcon: catIcon, logo: logo, toneStyle: toneStyle,
    bgStyle: bgStyle, bgAttr: bgAttr, mediaSrc: mediaSrc, cardHref: cardHref, editHref: editHref, link: link,
    nameNode: nameNode, nameHTML: nameHTML, initTags: initTags, useCatalog: useCatalog, subView: subView, vendor: vendor,
    fromOwn: fromOwn, fromPublic: fromPublic, blank: blank, render: render, extras: extras, machineBig: machineBig,
    faceSmall: faceSmall, personFace: personFace, whoLine: whoLine, nm: nm, gag: gag, devLabel: devLabel, routeZh: routeZh,
    SKINS: SKINS, MODELS: MODELS, OUTFIT: OUTFIT, SLOTS: SLOTS, BGS: BGS, FACE_COLORS: FACE_COLORS, BRANDS: BRANDS,
    CATS: CATS, CATMAP: CATMAP, VENDORS: VENDORS, ROUTES: ROUTES,
    get RMAP() { return RMAP; }, get SUBS() { return SUBS; }, get SUBMAP() { return SUBMAP; }
  };
  root.RJ_CARD = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
