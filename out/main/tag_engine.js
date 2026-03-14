/**
 * Tag Engine - SourceFlowX tag_engine.py JS port
 * 접두어 기반: Cat:, Brand:, Price:, Feature:, Use:, Keyword:, Bestseller:, NewArrival:, Rating:, Prime:, Source:
 */

// ================================================================
// 1. 카테고리 태그 (breadcrumb 기반)
// ================================================================
function generateCategoryTags(product) {
  const tags = [];
  const breadcrumb = product.tags || product.category_breadcrumb || [];
  const crumbs = Array.isArray(breadcrumb) ? breadcrumb : [];
  for (const crumb of crumbs) {
    const clean = crumb.trim();
    if (clean) {
      const tag = "Cat:" + clean.replace(/ /g, "-");
      if (!tags.includes(tag)) tags.push(tag);
    }
  }
  return tags;
}

// ================================================================
// 2. 브랜드 태그
// ================================================================
function generateBrandTags(product) {
  const brand = (product.brand || "").trim();
  if (brand) return ["Brand:" + brand.replace(/ /g, "-")];
  return [];
}

// ================================================================
// 3. 가격대 태그
// ================================================================
function generatePriceTags(product) {
  const price = product.price || 0;
  if (!price || price <= 0) return [];
  if (price < 25) return ["Price:Under-25"];
  if (price < 50) return ["Price:25-50"];
  if (price < 100) return ["Price:50-100"];
  if (price < 200) return ["Price:100-200"];
  if (price < 500) return ["Price:200-500"];
  return ["Price:Over-500"];
}

// ================================================================
// 4. Feature 태그
// ================================================================
const FEATURE_PATTERNS = [
  [/bluetooth\s*([\d.]+)/i, (m) => `Feature:Bluetooth-${m[1]}`],
  [/bluetooth/i, () => "Feature:Bluetooth"],
  [/wi-?fi\s*(\d+[a-z]*)/i, (m) => `Feature:WiFi-${m[1]}`],
  [/wi-?fi/i, () => "Feature:WiFi"],
  [/5g\s*\/?\s*2\.4g/i, () => "Feature:Dual-Band-WiFi"],
  [/dual[- ]?band/i, () => "Feature:Dual-Band"],
  [/(?:active\s+)?noise\s+cancell?(?:ing|ation)/i, () => "Feature:Noise-Cancelling"],
  [/\banc\b/i, () => "Feature:ANC"],
  [/\benc\b/i, () => "Feature:ENC"],
  [/ip(?:x?)(\d+)/i, (m) => `Feature:IP${m[0].toLowerCase().includes("x") ? "X" : ""}${m[1]}-Waterproof`],
  [/waterproof/i, () => "Feature:Waterproof"],
  [/water[- ]?resistant/i, () => "Feature:Water-Resistant"],
  [/sweatproof/i, () => "Feature:Sweatproof"],
  [/dustproof/i, () => "Feature:Dustproof"],
  [/dolby\s*(?:audio|atmos|digital)?/i, () => "Feature:Dolby-Audio"],
  [/hi-?fi/i, () => "Feature:HiFi"],
  [/stereo/i, () => "Feature:Stereo"],
  [/deep\s*bass/i, () => "Feature:Deep-Bass"],
  [/surround\s*sound/i, () => "Feature:Surround-Sound"],
  [/4k/i, () => "Feature:4K"],
  [/1080p/i, () => "Feature:1080P"],
  [/720p/i, () => "Feature:720P"],
  [/full\s*hd/i, () => "Feature:Full-HD"],
  [/hdr(?:\d+)?/i, () => "Feature:HDR"],
  [/(\d+)\s*ansi/i, (m) => `Feature:${m[1]}-ANSI`],
  [/(\d+)\s*(?:hrs?|hours?)\s*(?:battery|playtime|playback)/i, (m) => `Feature:${m[1]}Hr-Battery`],
  [/(?:battery|playtime|playback)\s*(?:up\s*to\s*)?(\d+)\s*(?:hrs?|hours?)/i, (m) => `Feature:${m[1]}Hr-Battery`],
  [/(?:usb[- ]?c|type[- ]?c)/i, () => "Feature:USB-C"],
  [/fast\s*charg(?:ing|e)/i, () => "Feature:Fast-Charging"],
  [/wireless\s*charg(?:ing|e)/i, () => "Feature:Wireless-Charging"],
  [/auto[- ]?focus/i, () => "Feature:Auto-Focus"],
  [/voice\s*(?:control|assistant)/i, () => "Feature:Voice-Control"],
  [/touch\s*control/i, () => "Feature:Touch-Control"],
  [/wireless/i, () => "Feature:Wireless"],
  [/true\s*wireless/i, () => "Feature:True-Wireless"],
  [/\btws\b/i, () => "Feature:TWS"],
  [/hdmi/i, () => "Feature:HDMI"],
  [/lightweight/i, () => "Feature:Lightweight"],
  [/portable/i, () => "Feature:Portable"],
  [/foldable/i, () => "Feature:Foldable"],
  [/ergonomic/i, () => "Feature:Ergonomic"],
  [/compact/i, () => "Feature:Compact"],
  [/stainless\s*steel/i, () => "Feature:Stainless-Steel"],
  [/camera|1080p\s*hd\s*video/i, () => "Feature:Camera"],
  [/roku/i, () => "Feature:Roku-Built-In"],
  [/android\s*tv/i, () => "Feature:Android-TV"],
  [/google\s*tv/i, () => "Feature:Google-TV"],
  [/oled/i, () => "Feature:OLED"],
  [/qled/i, () => "Feature:QLED"],
  [/mini[- ]?led/i, () => "Feature:Mini-LED"],
  [/nano[- ]?cell/i, () => "Feature:NanoCell"],
];

function generateFeatureTags(product) {
  let text = product.title || "";
  const bullets = product.aboutThis || product.bullet_points || [];
  if (Array.isArray(bullets) && bullets.length) text += " " + bullets.join(" ");

  const tags = [];
  const seen = new Set();

  for (const [pattern, tagFunc] of FEATURE_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      const tag = tagFunc(m);
      if (!seen.has(tag.toUpperCase())) {
        seen.add(tag.toUpperCase());
        tags.push(tag);
      }
    }
  }

  // 버전 있으면 일반 태그 제외
  const vals = tags.map((t) => t.toUpperCase());
  let final = [...tags];
  if (vals.some((t) => t.includes("BLUETOOTH-"))) final = final.filter((t) => t.toUpperCase() !== "FEATURE:BLUETOOTH");
  if (vals.some((t) => t.includes("IPX") && t.includes("WATERPROOF"))) final = final.filter((t) => t.toUpperCase() !== "FEATURE:WATERPROOF");
  if (vals.some((t) => t.includes("WIFI-"))) final = final.filter((t) => t.toUpperCase() !== "FEATURE:WIFI");
  if (vals.some((t) => ["1080P", "4K", "720P"].some((r) => t.includes(r)))) final = final.filter((t) => t.toUpperCase() !== "FEATURE:FULL-HD");

  return final;
}

// ================================================================
// 5. Use (용도) 태그
// ================================================================
const USE_PATTERNS = [
  [/\boutdoor\b/i, "Use:Outdoor"],
  [/\bsports?\b/i, "Use:Sports"],
  [/\brunning\b/i, "Use:Running"],
  [/\bgaming\b/i, "Use:Gaming"],
  [/\bworkout\b/i, "Use:Workout"],
  [/\bgym\b/i, "Use:Gym"],
  [/\btravel\b/i, "Use:Travel"],
  [/\bcamping\b/i, "Use:Camping"],
  [/\byoga\b/i, "Use:Yoga"],
  [/\bswim(?:ming)?\b/i, "Use:Swimming"],
  [/\bhome\s*(?:theater|cinema)\b/i, "Use:Home-Theater"],
  [/\bbedroom\b/i, "Use:Bedroom"],
  [/\boffice\b/i, "Use:Office"],
  [/\bcat\b/i, "Use:Cat"],
  [/\bdog\b/i, "Use:Dog"],
  [/\bpet\b/i, "Use:Pet"],
  [/\bkids?\b/i, "Use:Kids"],
];

function generateUseTags(product) {
  let text = product.title || "";
  const bullets = product.aboutThis || product.bullet_points || [];
  if (Array.isArray(bullets) && bullets.length) text += " " + bullets.join(" ");

  const tags = [];
  const seen = new Set();
  for (const [pattern, tag] of USE_PATTERNS) {
    if (pattern.test(text)) {
      if (!seen.has(tag.toUpperCase())) {
        seen.add(tag.toUpperCase());
        tags.push(tag);
      }
    }
  }
  return tags;
}

// ================================================================
// 6. Keyword 태그
// ================================================================
const STOP_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with","by",
  "from","is","it","as","be","was","are","this","that","these","those","has",
  "have","had","not","no","can","will","do","does","did","its","your","our",
  "my","up","out","if","so","just","about","into","over","after","all","also",
  "than","then","very","too","more","most","each","every","any","both","few",
  "many","much","own","such","only","same","other","new","old","first","last",
  "see","product","details","item","buy","sale","free","shipping","delivery",
  "pack","pcs","set","pair","compatible","included","includes","include",
  "version","latest","newest","upgraded","update","generation","gen","model",
  "series","edition","style","type","size","color","black","white","red",
  "blue","green","pink","gray","grey","silver","gold","per","day","ring",
  "sealed","hrs","hour","hours","ear","buds","led","ipx","use","full",
  "based","via","way","one","two","three","four","five","six","seven",
  "eight","nine","ten","max","total","ultra","super","plus","real","true",
  "like","best","good","great","high","low","top","dual","single","double",
  "triple","multi","extra","long","short","big","small","large","medium",
  "case","box","bag","cup","cups","power","display","control","mode",
  "support","supports","feature","features","design","built","time",
  "quality","sound","audio","music","call","calls","voice","hands","hand",
  "life","range","level","system","device","devices","technology","app",
  "apps","smart","advanced","premium","professional","original","official",
  "certified","bluetooth","wireless","wifi","usb","hdmi","waterproof",
  "portable","mini","pro","noise","cancelling","canceling",
]);

function generateKeywordTags(product) {
  const title = product.title || "";
  const brand = (product.brand || "").toLowerCase();
  const words = title.match(/[a-zA-Z]+(?:-[a-zA-Z]+)*/g) || [];

  const tags = [];
  const seen = new Set();
  for (const word of words) {
    const w = word.toLowerCase();
    if (w.length <= 2) continue;
    if (STOP_WORDS.has(w)) continue;
    if (w === brand) continue;
    const tag = "Keyword:" + word.charAt(0).toUpperCase() + word.slice(1);
    if (!seen.has(tag.toUpperCase())) {
      seen.add(tag.toUpperCase());
      tags.push(tag);
    }
  }
  return tags;
}

// ================================================================
// 7. Bestseller 태그
// ================================================================
function generateBestsellerTags(product) {
  const bsr = product.bsr_ranks || [];
  if (!Array.isArray(bsr) || bsr.length === 0) return [];
  const best = Math.min(...bsr.map((r) => r.rank || 999999));
  const tags = [];
  if (best <= 10) tags.push("Bestseller:Top-10");
  if (best <= 50) tags.push("Bestseller:Top-50");
  if (best <= 100) tags.push("Bestseller:Top-100");
  if (best <= 500) tags.push("Bestseller:Top-500");
  if (best <= 1000) tags.push("Bestseller:Top-1000");
  return tags;
}

// ================================================================
// 8. NewArrival 태그
// ================================================================
const DATE_FORMATS = [
  /^(\w+)\s+(\d{1,2}),\s*(\d{4})$/,   // "March 13, 2026"
  /^(\d{4})-(\d{2})-(\d{2})$/,          // "2026-03-13"
];

const MONTHS = {
  january:0,february:1,march:2,april:3,may:4,june:5,
  july:6,august:7,september:8,october:9,november:10,december:11,
};

function parseDate(str) {
  if (!str) return null;
  str = str.trim();
  // "March 13, 2026" or "February 25, 2026"
  const m1 = str.match(/^(\w+)\s+(\d{1,2}),?\s*(\d{4})$/);
  if (m1) {
    const mon = MONTHS[m1[1].toLowerCase()];
    if (mon !== undefined) return new Date(parseInt(m1[3]), mon, parseInt(m1[2]));
  }
  // "2026-03-13"
  const m2 = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return new Date(parseInt(m2[1]), parseInt(m2[2]) - 1, parseInt(m2[3]));
  // "March 2026"
  const m3 = str.match(/^(\w+)\s+(\d{4})$/);
  if (m3) {
    const mon = MONTHS[m3[1].toLowerCase()];
    if (mon !== undefined) return new Date(parseInt(m3[2]), mon, 1);
  }
  return null;
}

function generateNewArrivalTags(product) {
  const dateStr = product.date_first_available || "";
  const release = parseDate(dateStr);
  if (!release) return [];
  const days = Math.floor((Date.now() - release.getTime()) / 86400000);
  const tags = [];
  if (days <= 30) tags.push("NewArrival:30days");
  if (days <= 90) tags.push("NewArrival:90days");
  if (days <= 180) tags.push("NewArrival:180days");
  return tags;
}

// ================================================================
// 9. Rating 태그
// ================================================================
function generateRatingTags(product) {
  const rating = product.rating || 0;
  if (!rating || rating <= 0) return [];
  const tags = [];
  if (rating >= 4.5) tags.push("Rating:4.5+");
  if (rating >= 4.0) tags.push("Rating:4.0+");
  if (rating >= 3.5) tags.push("Rating:3.5+");
  return tags;
}

// ================================================================
// 10. Prime / Source 태그
// ================================================================
function generatePrimeTags(product) {
  if (product.is_prime) return ["Prime:Yes"];
  return [];
}

function generateSourceTags() {
  return ["Source:Amazon-US"];
}

// ================================================================
// 메인: 전체 태그 생성
// ================================================================
function generateAllTags(product) {
  const all = [
    ...generateCategoryTags(product),
    ...generateBrandTags(product),
    ...generatePriceTags(product),
    ...generateFeatureTags(product),
    ...generateUseTags(product),
    ...generateKeywordTags(product),
    ...generateBestsellerTags(product),
    ...generateNewArrivalTags(product),
    ...generateRatingTags(product),
    ...generatePrimeTags(product),
    ...generateSourceTags(),
  ];

  // 중복 제거 (순서 유지)
  const seen = new Set();
  return all.filter((tag) => {
    const upper = tag.toUpperCase();
    if (seen.has(upper)) return false;
    seen.add(upper);
    return true;
  });
}

module.exports = { generateAllTags };
