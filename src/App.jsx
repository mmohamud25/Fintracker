import { useState, useEffect, useRef, createContext, useContext } from "react";
import { AreaChart, Area, BarChart, Bar as RBar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import * as Papa from "papaparse";

const LIGHT={bg:"#F0F4F8",card:"#FFFFFF",card2:"#F7F9FC",border:"#E2E8F0",teal:"#0D9488",gold:"#D97706",red:"#DC2626",text:"#1A202C",muted:"#64748B",purple:"#7C3AED",green:"#16A34A",shadow:"0 1px 6px rgba(0,0,0,.07)",sidebar:"#FFFFFF"};
const DARK ={bg:"#070C14",card:"#0D1523",card2:"#0A1220",border:"#1A2840",teal:"#00D9A6",gold:"#F5A623",red:"#FF5C5C",text:"#E2EBF5",muted:"#5C7A99",purple:"#7C6FFF",green:"#4ADE80",shadow:"none",sidebar:"#0D1523"};
const ThemeCtx=createContext(LIGHT);
const useG=()=>useContext(ThemeCtx);
function useIsMobile(){const [m,setM]=useState(()=>window.innerWidth<768);useEffect(()=>{const h=()=>setM(window.innerWidth<768);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);return m;}

const SB_URL="https://uesuhjkerdhveyrkcxcs.supabase.co";
const SB_ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlc3VoamtlcmRodmV5cmtjeGNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MDUxNTYsImV4cCI6MjA5MTI4MTE1Nn0.abhh7gowMxfxV2ZGLhAriF8NotEHf4AecyrSfpWjX5I";
const ADMIN_EMAIL="mohamedmohammud@gmail.com"; // your admin email

// ── AUTH API ──────────────────────────────────────────────────────────────────
const auth={
  _token:null,_user:null,_refreshToken:null,
  headers(tok){return{"Content-Type":"application/json","apikey":SB_ANON,"Authorization":`Bearer ${tok||SB_ANON}`};},
  async signUp(email,password,meta={}){
    const r=await fetch(`${SB_URL}/auth/v1/signup`,{method:"POST",headers:this.headers(),body:JSON.stringify({email,password,data:meta})});
    const d=await r.json();if(d.error)throw new Error(d.error.message||d.msg||"Sign up failed");
    return d;
  },
  async signIn(email,password){
    const r=await fetch(`${SB_URL}/auth/v1/token?grant_type=password`,{method:"POST",headers:this.headers(),body:JSON.stringify({email,password})});
    const d=await r.json();if(d.error||d.error_code)throw new Error(d.error_description||d.msg||"Invalid email or password");
    this._token=d.access_token;this._refreshToken=d.refresh_token;this._user=d.user;
    localStorage.setItem("sb_token",d.access_token);localStorage.setItem("sb_refresh",d.refresh_token);
    return d;
  },
  async signOut(){
    try{await fetch(`${SB_URL}/auth/v1/logout`,{method:"POST",headers:this.headers(this._token)});}catch{}
    this._token=null;this._user=null;this._refreshToken=null;
    localStorage.removeItem("sb_token");localStorage.removeItem("sb_refresh");
  },
  async resetPassword(email){
    const r=await fetch(`${SB_URL}/auth/v1/recover`,{method:"POST",headers:this.headers(),body:JSON.stringify({email})});
    const d=await r.json();if(d.error)throw new Error(d.error.message||"Reset failed");
    return d;
  },
  async refreshSession(){
    const rt=this._refreshToken||localStorage.getItem("sb_refresh");
    if(!rt)return null;
    try{
      const r=await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`,{method:"POST",headers:this.headers(),body:JSON.stringify({refresh_token:rt})});
      const d=await r.json();if(d.error||!d.access_token)return null;
      this._token=d.access_token;this._refreshToken=d.refresh_token;this._user=d.user;
      localStorage.setItem("sb_token",d.access_token);localStorage.setItem("sb_refresh",d.refresh_token);
      return d;
    }catch{return null;}
  },
  async getUser(){
    const tok=this._token||localStorage.getItem("sb_token");
    if(!tok)return null;
    try{
      const r=await fetch(`${SB_URL}/auth/v1/user`,{headers:this.headers(tok)});
      const d=await r.json();if(d.error)return null;
      this._token=tok;this._user=d;return d;
    }catch{return null;}
  },
  async updateUser(updates){
    const r=await fetch(`${SB_URL}/auth/v1/user`,{method:"PUT",headers:this.headers(this._token),body:JSON.stringify(updates)});
    const d=await r.json();if(d.error)throw new Error(d.error.message||"Update failed");
    this._user=d;return d;
  },
  async updatePassword(newPassword){return this.updateUser({password:newPassword});},
  token(){return this._token||localStorage.getItem("sb_token");},
  user(){return this._user;},
  isAdmin(){return this._user?.email===ADMIN_EMAIL;},
};

// ── DATA STORE ────────────────────────────────────────────────────────────────
// ISOLATION: Every key is prefixed with the user's ID (e.g. "abc123:transactions")
// This means two users with key "transactions" get DIFFERENT rows in the DB.
// user_id is also written to the column so Supabase RLS enforces it at DB level.
// Result: complete data isolation — users CANNOT see each other's data.
const store={
  _uid(){return auth.user()?.id||null;},
  _key(k){const uid=this._uid();return uid?`${uid}:${k}`:k;},
  _h(tok){return{"Content-Type":"application/json","apikey":SB_ANON,"Authorization":`Bearer ${tok}`,"Accept":"application/json"};},

  async get(k){
    const tok=auth.token();if(!tok)return null;
    const scopedKey=this._key(k);
    try{
      const r=await fetch(
        `${SB_URL}/rest/v1/fintrack_data?key=eq.${encodeURIComponent(scopedKey)}&select=value`,
        {headers:this._h(tok)}
      );
      if(!r.ok)return null;
      const d=await r.json();
      return d.length?JSON.parse(d[0].value):null;
    }catch{return null;}
  },

  async set(k,v){
    const tok=auth.token();if(!tok)return false;
    const uid=this._uid();if(!uid)return false;
    const scopedKey=this._key(k);
    const hdrs={"Content-Type":"application/json","apikey":SB_ANON,"Authorization":`Bearer ${tok}`};
    if(v===null){
      try{await fetch(`${SB_URL}/rest/v1/fintrack_data?key=eq.${encodeURIComponent(scopedKey)}`,{method:"DELETE",headers:hdrs});}catch{}
      return true;
    }
    try{
      const r=await fetch(`${SB_URL}/rest/v1/fintrack_data`,{
        method:"POST",
        headers:{...hdrs,"Prefer":"resolution=merge-duplicates"},
        body:JSON.stringify({key:scopedKey,value:JSON.stringify(v),user_id:uid})
      });
      return r.ok;
    }catch{return false;}
  },

  async deleteAll(){
    const keys=["transactions","budgets","subscriptions","goals","assets","liabilities","cards","netWorthHistory","recurring","currency"];
    await Promise.all(keys.map(k=>this.set(k,null)));
  }
};

const SEED_TXN=[
  {id:1,date:"2026-04-01",desc:"April Salary",amount:3500,type:"income",category:"Salary",note:""},
  {id:2,date:"2026-04-02",desc:"Rent",amount:1200,type:"expense",category:"Housing",note:""},
  {id:3,date:"2026-04-03",desc:"Walmart Groceries",amount:87.5,type:"expense",category:"Food",note:""},
  {id:4,date:"2026-04-04",desc:"Netflix",amount:15.99,type:"expense",category:"Entertainment",note:""},
  {id:5,date:"2026-04-05",desc:"Gas",amount:55,type:"expense",category:"Transport",note:""},
  {id:6,date:"2026-04-06",desc:"Freelance Project",amount:600,type:"income",category:"Freelance",note:"Kulan Studio"},
  {id:7,date:"2026-04-07",desc:"Restaurant",amount:42,type:"expense",category:"Food",note:""},
  {id:8,date:"2026-04-08",desc:"Gym",amount:40,type:"expense",category:"Health",note:""},
  {id:9,date:"2026-03-01",desc:"March Salary",amount:3500,type:"income",category:"Salary",note:""},
  {id:10,date:"2026-03-02",desc:"Rent",amount:1200,type:"expense",category:"Housing",note:""},
  {id:11,date:"2026-03-10",desc:"Amazon",amount:134.99,type:"expense",category:"Shopping",note:""},
  {id:12,date:"2026-03-15",desc:"Electric Bill",amount:78,type:"expense",category:"Utilities",note:""},
  {id:13,date:"2026-03-20",desc:"Side Hustle",amount:300,type:"income",category:"Freelance",note:""},
  {id:14,date:"2026-02-01",desc:"Feb Salary",amount:3500,type:"income",category:"Salary",note:""},
  {id:15,date:"2026-02-02",desc:"Rent",amount:1200,type:"expense",category:"Housing",note:""},
  {id:16,date:"2026-02-14",desc:"Valentine Dinner",amount:95,type:"expense",category:"Food",note:""},
  {id:17,date:"2026-02-20",desc:"Course Fee",amount:49,type:"expense",category:"Education",note:""},
];
const SEED_BUDGETS=[{category:"Housing",limit:1300,rollover:0},{category:"Food",limit:400,rollover:0},{category:"Transport",limit:150,rollover:0},{category:"Entertainment",limit:80,rollover:0},{category:"Health",limit:100,rollover:0},{category:"Shopping",limit:200,rollover:0},{category:"Utilities",limit:120,rollover:0},{category:"Education",limit:100,rollover:0}];
const SEED_SUBS=[{id:1,name:"Netflix",amount:15.99,due:4,category:"Entertainment",paidMonths:[]},{id:2,name:"Spotify",amount:9.99,due:10,category:"Entertainment",paidMonths:[]},{id:3,name:"Gym",amount:40,due:1,category:"Health",paidMonths:[]},{id:4,name:"iCloud",amount:2.99,due:15,category:"Utilities",paidMonths:[]},{id:5,name:"Adobe CC",amount:54.99,due:22,category:"Shopping",paidMonths:[]}];
const SEED_GOALS=[{id:1,name:"Emergency Fund",target:10000,saved:3200,icon:"🛡️"},{id:2,name:"Vacation",target:3000,saved:850,icon:"✈️"},{id:3,name:"New Laptop",target:1500,saved:600,icon:"💻"}];
const SEED_ASSETS=[{id:1,name:"Checking",value:4200,type:"cash"},{id:2,name:"Savings",value:8500,type:"cash"},{id:3,name:"401k",value:22000,type:"investment"},{id:4,name:"Car",value:12000,type:"vehicle"}];
const SEED_LIAB=[{id:1,name:"Car Loan",value:8500,type:"auto"},{id:2,name:"Credit Card",value:1200,type:"credit"},{id:3,name:"Student Loan",value:15000,type:"student"}];
const SEED_CARDS=[
  {id:1,name:"Chase Sapphire",last4:"4821",limit:8000,balance:2400,apr:22.99,minPayment:48,dueDay:15,ca:"#1a1a2e",cb:"#16213e",payments:[]},
  {id:2,name:"Capital One",last4:"3309",limit:5000,balance:1100,apr:19.99,minPayment:25,dueDay:22,ca:"#00695c",cb:"#004d40",payments:[]},
];
const SEED_NWH=[{date:"2026-01-01",netWorth:18000,assets:46700,liabilities:28700},{date:"2026-02-01",netWorth:19500,assets:47200,liabilities:27700},{date:"2026-03-01",netWorth:20200,assets:47500,liabilities:27300},{date:"2026-04-08",netWorth:21000,assets:46700,liabilities:24700}];

const CATEGORIES=["Housing","Food","Transport","Entertainment","Health","Shopping","Utilities","Education","Salary","Freelance","Investment","Dining","Coffee","Groceries","Travel","Fitness","Insurance","Childcare","Pets","Personal Care","Clothing","Electronics","Home Improvement","Gifts","Charity","Taxes","Business","Subscriptions","Medical","Transfers","Bank Fees","ATM & Cash","Other"];
const CAT_COLOR={Housing:"#DC2626",Food:"#D97706",Transport:"#0D9488",Entertainment:"#7C3AED",Health:"#EA580C",Shopping:"#DB2777",Utilities:"#0284C7",Education:"#16A34A",Salary:"#059669",Freelance:"#D97706",Investment:"#7C3AED",Dining:"#F59E0B",Coffee:"#92400E",Groceries:"#65A30D",Travel:"#0891B2",Fitness:"#DC2626",Insurance:"#6366F1",Childcare:"#EC4899",Pets:"#F97316","Personal Care":"#A855F7",Clothing:"#DB2777",Electronics:"#3B82F6","Home Improvement":"#84CC16",Gifts:"#F43F5E",Charity:"#10B981",Taxes:"#6B7280",Business:"#1D4ED8",Subscriptions:"#8B5CF6",Medical:"#EF4444",Transfers:"#64748B","Bank Fees":"#9CA3AF","ATM & Cash":"#6B7280",Other:"#64748B"};
const CARD_GRADS=[{a:"#1a1a2e",b:"#16213e"},{a:"#922b21",b:"#641e16"},{a:"#1a3a5c",b:"#0d2137"},{a:"#9a7509",b:"#6d5004"},{a:"#00695c",b:"#004d40"},{a:"#4834d4",b:"#2c1fa8"},{a:"#2d3436",b:"#1a1f20"},{a:"#6d1f5e",b:"#4a1040"}];

const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2);
const todayStr=()=>new Date().toISOString().slice(0,10);
const yesterdayStr=()=>new Date(Date.now()-86400000).toISOString().slice(0,10);
const monthKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const NW_MILESTONES=[1000,5000,10000,25000,50000,100000,250000,500000,1000000];
const CURRENCIES=[{code:"USD",symbol:"$",name:"US Dollar"},{code:"EUR",symbol:"€",name:"Euro"},{code:"GBP",symbol:"£",name:"British Pound"},{code:"SAR",symbol:"\u0631\u06cc\u0627\u0644",name:"Saudi Riyal"},{code:"AED",symbol:"\u062f.\u0625",name:"UAE Dirham"},{code:"SOS",symbol:"Sh",name:"Somali Shilling"},{code:"ETB",symbol:"Br",name:"Ethiopian Birr"},{code:"KES",symbol:"Ksh",name:"Kenyan Shilling"},{code:"TRY",symbol:"\u20ba",name:"Turkish Lira"},{code:"CAD",symbol:"CA$",name:"Canadian Dollar"},{code:"AUD",symbol:"A$",name:"Australian Dollar"},{code:"JPY",symbol:"\u00a5",name:"Japanese Yen"}];
const fmt=n=>`$${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,",")}`;// global fallback, overridden in App
const fmtM=m=>m>=12?`${Math.floor(m/12)}y ${m%12}m`:`${m}mo`;

/* ── SMART AUTO-CATEGORIZER ── */
const CAT_KEYWORDS={
  // ── TRANSFERS & PAYMENTS ──────────────────────────────────────────────────
  Transfers:["zelle","venmo","cashapp","cash app","paypal","apple pay","google pay","samsung pay","wire transfer","ach transfer","ach payment","bank transfer","external transfer","transfer to","transfer from","xfer","outgoing wire","incoming wire","p2p","peer to peer","send money","receive money","remitly","western union","moneygram","worldremit","wise transfer","international wire","debit memo","credit memo","returned item","nsf","overdraft","account transfer","savings transfer","checking transfer","sweep"],
  // ── HOUSING ───────────────────────────────────────────────────────────────
  Housing:["rent","mortgage","lease","landlord","apartment","hoa","housing","realtor","realty","property management","greystar","equity residential","avalonbay","camden property","lincoln property","pmc","spieker","irvine company","related cos","aimco","essex property","udr inc","nrp group","nef","national western","home owners assoc"],
  // ── DINING & RESTAURANTS ─────────────────────────────────────────────────
  Dining:["mcdonald","mcdonalds","burger king","wendy","taco bell","chipotle","panera","chick-fil","popeyes","ihop","applebee","chili","olive garden","denny","subway","five guys","shake shack","in-n-out","whataburger","sonic drive","waffle house","cracker barrel","red lobster","outback","texas roadhouse","cheesecake factory","p.f. chang","hooters","buffalo wild","grubhub","doordash","uber eats","postmates","seamless","caviar","dining","eatery","bistro","grill","tavern","pizzeria","sushi","ramen","pho","thai","indian restaurant","chinese restaurant","mexican restaurant","italian restaurant","tst*","sq *","dine","eats","kitchen","barbeque","bbq","wings","steakhouse","smokehouse","noodle","deli","sub shop","sandwich","wing stop","wingstop","zoes","zaxbys","raising canes","portillos","culvers","freddys","smashburger","habit burger","del taco","jack in the box","carl jr","hardees","arby","long john silver","checkers","rallys","steak n shake","white castle","krystal","krystals","captain d","pollo","el pollo","panda express","pei wei","flame broiler","ono hawaiian","l&l","boba","bubble tea"],
  // ── COFFEE & DRINKS ──────────────────────────────────────────────────────
  Coffee:["starbucks","dunkin","dunkin donuts","tim horton","peet","dutch bros","coffee bean","caribou","biggby","philz","blue bottle","intelligentsia","coffee","cafe","espresso","latte","barista","boba tea","juice bar","smoothie king","jamba juice","tropical smoothie","mcalister","einstein bagel","panera bread","bruegger"],
  // ── GROCERIES ────────────────────────────────────────────────────────────
  Groceries:["walmart","wal-mart","wm superctr","wm super","kroger","safeway","whole foods","wholefds","trader joe","aldi","costco","target","publix","heb","h-e-b","wegmans","meijer","food lion","giant food","winn-dixie","sprouts","natural grocers","fresh market","lidl","grocery","supermarket","market basket","price chopper","stop shop","stop & shop","shoprite","stater bros","winco","ingles","piggly","ralphs","vons","pavilions","randalls","tom thumb","brookshire","united market","price rite","save a lot","aldi","food 4 less","smart & final","grocery outlet","winco foods","fiesta mart","la michoacana","compare foods","bravo supermarket","c-town","associated supermarket","western beef","key food","food bazaar","associated food","frys food","fry's","fry food","schnucks","dierbergs","hy-vee","fareway","hy vee","bakers","albertsons","acme markets","jewel-osco","lucky stores","sav-on","pak n save","fresh & easy","trader joes","fresh thyme","earth fare","mom's organic"],
  // ── TRANSPORT & GAS ──────────────────────────────────────────────────────
  Transport:["shell","bp","chevron","exxon","mobil","speedway","wawa","racetrac","quiktrip","qt ","gas station","fuel","gasoline","petro","sunoco","citgo","marathon","valero","circle k","casey","kwik trip","kwiktrip","buc-ee","bucees","flying j","pilot travel","loves travel","ta travel","travel center","uber","lyft","taxi","cab","bus pass","metro card","transit","parking","meter","garage","toll","ez pass","ezpass","fastrak","i-pass","ipass","sunpass","pikepass","ntta","thruway","turnpike","car wash","jiffy lube","valvoline","midas","meineke","firestone","goodyear","pep boys","autozone","o'reilly","oreilly","napa auto","advance auto","enterprise","hertz","avis","budget car","zipcar","turo","airline","airport","flight","amtrak","greyhound","train ticket","transit pass","mta","bart","cta","wmata","septa","mbta","marta","dart","trimet","via transport","bird scooter","lime scooter","spin scooter","divvy","citi bike","lyft scooter","waymo","cruise rideshare"],
  // ── ENTERTAINMENT ────────────────────────────────────────────────────────
  Entertainment:["netflix","hulu","disney+","disney plus","hbo","peacock","paramount","apple tv","prime video","showtime","starz","crunchyroll","spotify","apple music","amazon music","pandora","tidal","youtube premium","twitch","steam","xbox","playstation","nintendo","epic games","roblox","cinema","amc theater","regal","cinemark","alamo drafthouse","movie","concert","ticketmaster","stubhub","eventbrite","comedy club","bowling","arcade","topgolf","minigolf","escape room","museum","zoo","aquarium","theme park","six flags","disneyland","universal studio","seaworld","gaming","dave & buster","dave and buster","chuck e cheese","main event","scene75","laser tag","trampoline","sky zone","altitude trampoline","urban air","bungee","go kart","race track","batting cage","paintball","rock climbing"],
  // ── HEALTH & MEDICAL ─────────────────────────────────────────────────────
  Health:["cvs","walgreens","rite aid","duane reade","pharmacy","doctor","physician","hospital","urgent care","clinic","dental","dentist","orthodont","vision","optometrist","eye exam","gym","planet fitness","la fitness","anytime fitness","24 hour fitness","equinox","orange theory","f45","peloton","soul cycle","crossfit","ymca","medicare","medicaid","copay","prescription","rx","lab test","blood test","radiology","physical therapy","chiropractic","mental health","therapy","counseling","psychiatr","quest diagnostic","labcorp","medline","biopsy","echocardiogram","colonoscopy","mammogram","dermatology","ophthalmology","orthopedic","podiatry","allergy","immunology","rheumatology"],
  // ── FITNESS ──────────────────────────────────────────────────────────────
  Fitness:["planet fitness","la fitness","anytime fitness","equinox","orange theory","f45","peloton","soul cycle","crossfit","ymca","workout","fitness","sport","athletic","running","yoga","pilates","cycling","swim","crunch fitness","lifetime fitness","24 hour fitness","gold's gym","golds gym","bally total","snap fitness","pure barre","barry's bootcamp","solidcore","row house","cyclebar"],
  // ── SHOPPING & RETAIL ────────────────────────────────────────────────────
  Shopping:["amazon","ebay","etsy","shopify","nordstrom","macy","bloomingdale","neiman marcus","saks","jcpenney","gap","old navy","banana republic","h&m","zara","uniqlo","forever 21","urban outfitters","anthropologie","free people","asos","shein","temu","wish","best buy","apple store","microsoft store","ikea","wayfair","overstock","home depot","lowes","lowe's","menards","ace hardware","true value","harbor freight","bed bath","crate and barrel","williams sonoma","pottery barn","tj maxx","ross","marshalls","burlington","dollar tree","dollar general","five below","family dollar","big lots","tuesday morning","tuesday mornings","ollie","bargain hunt","ocean state","building supply","lumber","hardware store","home goods","homegoods","tuesday morning","stein mart","bealls","stage store","gordmans","christopher banks","chico's","white house black","ann taylor","loft","j crew","j.crew","cole haan","kate spade","michael kors","coach","gucci","louis vuitton","ralph lauren","tommy hilfiger","calvin klein","polo ralph","nike","adidas","under armour","new balance","skechers","vans","converse","timberland","ugg","columbia sport","north face","patagonia","rei","cabela","bass pro","academy sport","dick's sport","dicks sporting","sports authority","sport chalet"],
  // ── HOME IMPROVEMENT ─────────────────────────────────────────────────────
  "Home Improvement":["home depot","lowes","lowe's","menards","ace hardware","true value","harbor freight","84 lumber","84lumber","plumber","electrician","handyman","contractor","hvac","roofing","flooring","painting","renovation","remodel","appliance","mattress","furniture","lawn","landscaping","pest control","cleaning service","maid","pressure wash","carpet clean","window clean","pool service","sprinkler","irrigation","fence","deck","patio","garage door","locksmith","roofer","siding","gutters","insulation","drywall","tile","hardwood","laminate","grout","caulk","lumber yard","builders supply","ferguson","waxman","watts water","american standard","kohler plumb","moen","delta faucet","andersen window","pella window"],
  // ── CLOTHING ─────────────────────────────────────────────────────────────
  Clothing:["zara","h&m","gap","old navy","banana republic","uniqlo","forever 21","urban outfitters","nordstrom rack","clothes","clothing","apparel","fashion","shirt","pants","shoes","boots","sneakers","dress","suit","jacket","coat","hat","accessories","jewelry","watch","thrift","consignment","poshmark","thredup","tradesy","rent the runway","stitch fix","trunk club","express fashion","white house black market","chico","soma","victoria secret","pink store","aerie","american eagle","hollister","abercrombie","fitch","zumiez","tillys","buckle","journeys","foot locker","foot action","finish line","champs sport","shoe dept","payless","dsw","famous footwear","shoe carnival"],
  // ── ELECTRONICS ──────────────────────────────────────────────────────────
  Electronics:["best buy","apple store","microsoft","newegg","b&h photo","adorama","fry","microcenter","gamestop","computer","laptop","iphone","samsung","tablet","ipad","phone","headphones","speaker","camera","drone","monitor","keyboard","mouse","charger","cable","tech","electronics","verizon store","att store","tmobile store","sprint store","straight talk","total wireless","boost mobile","metro by t-mobile","cricket wireless","lg electronics","sony store","bose","beats","sonos","ring doorbell","nest","arlo","wyze","simplisafe","eufy"],
  // ── TRAVEL ───────────────────────────────────────────────────────────────
  Travel:["airbnb","vrbo","booking.com","expedia","hotels.com","marriott","hilton","hyatt","ihg","wyndham","holiday inn","best western","motel 6","super 8","days inn","hampton inn","courtyard","residence inn","extended stay","embassy suites","doubletree","sheraton","westin","w hotel","st regis","four seasons","ritz carlton","intercontinental","hotel","hostel","resort","vacation rental","travel","airline","airport","delta","united","american airlines","southwest","frontier","spirit","jetblue","alaska air","lufthansa","emirates","british airways","air france","klm","tsa precheck","global entry","passport","visa fee","suitcase","luggage","tourism","cruise","carnival cruise","royal caribbean","norwegian cruise","princess cruise","celebrity cruise","disney cruise","tripadvisor","priceline","kayak","orbitz","travelocity","hotwire","trivago"],
  // ── INSURANCE ────────────────────────────────────────────────────────────
  Insurance:["geico","state farm","allstate","progressive","nationwide","farmers","usaa","liberty mutual","travelers","amica","esurance","insurance","premium","deductible","coverage","policy","renters","homeowners","auto insurance","life insurance","health insurance","dental insurance","aflac","metlife","prudential","new york life","northwestern mutual","guardian life","principal financial","unum","cigna","aetna","humana","blue cross","blue shield","kaiser","united health","anthem","molina","centene","oscar health","oscar ins"],
  // ── PERSONAL CARE ────────────────────────────────────────────────────────
  "Personal Care":["supercuts","great clips","fantastic sams","sport clips","hair salon","barber","haircut","nail salon","spa","massage","facial","wax","beauty supply","ulta","sephora","sally beauty","shampoo","conditioner","lotion","skincare","makeup","cosmetics","perfume","cologne","razor","shave","toothbrush","dental care","regis salon","cost cutters","floyd's barbershop","roosters","the art of shaving","aveda","kiehl","origins","clinique","estee lauder","lancome","mac cosmetics","nars","too faced","urban decay","benefit cosmet"],
  // ── PETS ─────────────────────────────────────────────────────────────────
  Pets:["petco","petsmart","chewy","pet supplies","pet food","vet","veterinar","animal hospital","pet grooming","dog boarding","dog walker","cat litter","dog food","cat food","pet store","animal clinic","banfield","vca animal","bluepearl","petmd","1800petmeds","pet smart","pet supplies plus","pet supermarket","wag","rover","petflow","pet360"],
  // ── CHILDCARE & KIDS ─────────────────────────────────────────────────────
  Childcare:["daycare","nursery","preschool","babysitter","nanny","after school","child care","kids","elementary","montessori","tutor","children","pediatric","bright horizon","learning care","kindercare","la petite","primrose school","goddard school","the learning experience","little gym","gymboree","soccer shots","abc mouse","outschool","varsity tutor","kumon","sylvan learning","mathnasium"],
  // ── GIFTS & OCCASIONS ────────────────────────────────────────────────────
  Gifts:["hallmark","1-800-flowers","ftd","teleflora","gift card","gift wrap","birthday","anniversary","holiday gift","wedding gift","baby shower","bridal shower","flower","florist","balloon","party city","party supply","card factory","american greetings","build-a-bear","edible arrangement","shari berry","harry david","omaha steak","gold belly","goldbelly","mouth.com"],
  // ── CHARITY & RELIGIOUS ──────────────────────────────────────────────────
  Charity:["goodwill","salvation army","red cross","habitat for humanity","unicef","feeding america","st. jude","cancer research","humane society","wwf","sierra club","aclu","naacp","donation","donate","charity","nonprofit","foundation","fundraiser","pledge","tithe","church","mosque","temple","zakat","sadaqah","masjid","cathedral","parish","synagogue","diocese","giving","fund","endowment"],
  // ── UTILITIES & BILLS ────────────────────────────────────────────────────
  Utilities:["electric","electricity","pg&e","con ed","duke energy","dominion","xcel energy","pge","eversource","national grid","gas bill","atmos","nicor","spire","water bill","sewer","trash","garbage","recycling","internet","comcast","xfinity","spectrum","cox","optimum","att internet","verizon fios","centurylink","windstream","frontier comm","consolidated comm","phone bill","tmobile","verizon","sprint","boost mobile","cricket wireless","metro pcs","mint mobile","cell phone","utility","municipal","pseg","pepco","bg&e","centerpoint","entergy","teco","fpl","gulf power","dte energy","we energies","westar","evergy","empire state electric","con edison","comed","ameren","pge pacific gas","southern california gas","southwest gas","questar gas","piedmont natural","nicor gas","laclede gas","new jersey resources","south jersey","peoples gas"],
  // ── EDUCATION ────────────────────────────────────────────────────────────
  Education:["tuition","university","college","community college","school","udemy","coursera","linkedin learning","skillshare","masterclass","duolingo","rosetta stone","textbook","chegg","khan academy","bootcamp","coding bootcamp","general assembly","certification","course fee","class fee","student loan","academic","tutor","pearson","mcgraw","cengage","barnes noble college","follett","bookstore","campus store","continuing education","extension program"],
  // ── SUBSCRIPTIONS & SAAS ─────────────────────────────────────────────────
  Subscriptions:["netflix","hulu","disney+","hbo","peacock","paramount","apple tv","prime video","showtime","starz","crunchyroll","spotify","apple music","amazon music","pandora","tidal","youtube premium","twitch","adobe","microsoft 365","microsoft office","google one","icloud","dropbox","box","notion","slack","zoom","figma","canva","lastpass","1password","nordvpn","expressvpn","antivirus","norton","mcafee","subscription","recurring","membership","monthly fee","annual fee","annual subscription","auto renew","renewal","ditto","patreon","substack","the athletic","new york times","washington post","wall street journal","economist","atlantic","wired","medium","linkedin premium","indeed resume","glassdoor","ancestry","23andme","peloton app","calm","headspace","noom","weight watcher","weight watchers","beachbody","daily burn","mapmyrun","strava","garmin connect"],
  // ── BUSINESS & PROFESSIONAL ──────────────────────────────────────────────
  Business:["office depot","staples","fedex","ups","usps","shipping","postage","business card","accounting","quickbooks","xero","freshbooks","legal","attorney","notary","filing fee","business license","corp","llc","ein","aws","google cloud","azure","hosting","domain","software","saas","b2b","vendor","supplier","wholesale","vistaprint","moo print","4imprint","uline","grainger","fastenal","mcmaster-carr","w.w. grainger","global industrial","zoro","quill","global equipment","alibaba","alibaba.com","aliexpress"],
  // ── TAXES ────────────────────────────────────────────────────────────────
  Taxes:["irs","tax payment","turbotax","h&r block","taxact","jackson hewitt","liberty tax","state tax","federal tax","property tax","sales tax","estimated tax","tax prep","accountant","cpa","tax refund","dept of revenue","revenue dept","franchise tax","excise tax","county tax"],
  // ── SALARY & INCOME ──────────────────────────────────────────────────────
  Salary:["payroll","salary","direct deposit","paycheck","employer","wages","compensation","w2","income","ach deposit","wire transfer received","gusto payroll","adp payroll","paychex","paylocity","intuit payroll","bamboohr pay","zenefits","rippling","deel","remote.com","papaya global","trinet","insperity","oasis","paycor","paycom","ceridian","kronos","workday payroll"],
  // ── FREELANCE & GIG INCOME ───────────────────────────────────────────────
  Freelance:["freelance","upwork","fiverr","toptal","99designs","consulting","client payment","invoice","contract work","self-employed","1099","gig","side hustle","project payment","taskrabbit","thumbtack","handy","rover earnings","doordash earnings","uber earnings","lyft earnings","instacart earnings","grubhub earnings","shipt earnings","amazon flex","deliverr","lalamove","roadie","bungii","lugg"],
  // ── INVESTMENTS & BROKERAGE ──────────────────────────────────────────────
  Investment:["fidelity","vanguard","schwab","robinhood","coinbase","crypto","bitcoin","ethereum","stock","dividend","etf","brokerage","td ameritrade","e*trade","webull","acorns","stash","public.com","m1 finance","sofi invest","capital gain","interest income","mutual fund","roth","ira","401k","wealthfront","betterment","ellevest","siebert","merrill lynch","merrill edge","edward jones","raymond james","lpl financial","ameriprise","lincoln financial","jackson national","nationwide invest","prudential invest","new york life invest","principal invest","tiaa","cref","voya financial","nationwide financial","transamerica"],
  // ── BANK FEES & CHARGES ──────────────────────────────────────────────────
  "Bank Fees":["service charge","monthly fee","atm fee","overdraft fee","nsf fee","late fee","wire fee","paper statement","returned check","stop payment","account fee","maintenance fee","foreign transaction","currency conversion","annual fee card","minimum balance","dormant","inactivity fee","bank fee","finance charge","interest charge"],
  // ── ATM & CASH ───────────────────────────────────────────────────────────
  "ATM & Cash":["atm withdrawal","cash withdrawal","atm cash","cash advance","atm surcharge","cash dispense","withdraw","teller cash","cashback","cash back purchase","pos cash","debit cash"],
  // ── MEDICAL ──────────────────────────────────────────────────────────────
  Medical:["hospital","emergency room","er visit","urgent care","surgery","operation","procedure","lab work","blood test","mri","ct scan","xray","specialist","cardiolog","dermatolog","oncolog","neurolog","radiology","prescription drug","insulin","epipen","inhaler","ambulance","mayo clinic","cleveland clinic","johns hopkins","kaiser hospital","cvs minute clinic","walgreens health","tricare","va medical","veterans affairs","humana care","aetna health","cigna health","quest lab","labcorp","genoptix","bioref","concentra","statcare","nextcare","patient first","carenow","medexpress","workcare","occupational health"],
};

// ── SMART CATEGORY MATCHER ────────────────────────────────────────────────
// Handles messy real bank descriptions like:
// "SQ *COFFEE SHOP", "TST* RESTAURANT NAME", "PAYPAL *MERCHANT", 
// "POS DEBIT WM SUPERCTR", "ZELLE PAYMENT TO JOHN", "ACH CREDIT PAYROLL"
function autoCategory(desc){
  if(!desc)return"Other";
  const d=desc.toLowerCase()
    .replace(/\*/g," ")         // SQ *MERCHANT → SQ  MERCHANT
    .replace(/\s+/g," ")        // collapse spaces
    .replace(/tst\s+/g,"")      // strip TST prefix (Toast POS)
    .replace(/^sq\s+/g,"")      // strip SQ prefix (Square)
    .replace(/^pp\s+/g,"")      // strip PP (PayPal)
    .replace(/^paypal\s+\*/g,"")// strip PayPal *
    .replace(/^pos\s+(debit|credit|purchase)?\s*/g,"") // strip POS debit/credit
    .replace(/^debit\s+(card)?\s*/g,"")  // strip "DEBIT CARD"
    .replace(/^purchase\s+/g,"")
    .replace(/^checkcard\s+/g,"")
    .replace(/^visa\s+(debit|check)?\s*/g,"")
    .replace(/^mc\s+/g,"")
    .replace(/^ach\s+(debit|credit|payment|transfer)?\s*/g,"")
    .replace(/^dda\s+/g,"")
    .replace(/^\d{4,}/g,"")     // strip leading numbers (store IDs)
    .replace(/#\d+/g,"")        // strip #12345 store numbers
    .replace(/\d{5,}/g,"")      // strip long number codes
    .trim();
  for(const[cat,kws]of Object.entries(CAT_KEYWORDS)){
    if(kws.some(k=>d.includes(k)))return cat;
  }
  // Second pass: original desc without stripping (catches things like "LOWES #1234")
  const raw=desc.toLowerCase();
  for(const[cat,kws]of Object.entries(CAT_KEYWORDS)){
    if(kws.some(k=>raw.includes(k)))return cat;
  }
  return"Other";
}


/* ── TRANSACTION CALENDAR ── */
function CalendarView({transactions,fmt}){
  const G=useG();const isMobile=useIsMobile();
  const now=new Date();
  const[viewYear,setViewYear]=useState(now.getFullYear());
  const[viewMonth,setViewMonth]=useState(now.getMonth());
  const[selected,setSelected]=useState(null);
  const firstDay=new Date(viewYear,viewMonth,1).getDay();
  const daysInMonth=new Date(viewYear,viewMonth+1,0).getDate();
  const mk=`${viewYear}-${String(viewMonth+1).padStart(2,"0")}`;
  const monthTxns=transactions.filter(t=>t.date.startsWith(mk));
  const byDay={};monthTxns.forEach(t=>{const d=parseInt(t.date.split("-")[2]);if(!byDay[d])byDay[d]=[];byDay[d].push(t);});
  const totalIncome=monthTxns.filter(t=>t.type==="income").reduce((a,b)=>a+b.amount,0);
  const totalExpense=monthTxns.filter(t=>t.type==="expense").reduce((a,b)=>a+b.amount,0);
  const monthName=new Date(viewYear,viewMonth,1).toLocaleString("default",{month:"long",year:"numeric"});
  const prevMonth=()=>{if(viewMonth===0){setViewYear(y=>y-1);setViewMonth(11);}else setViewMonth(m=>m-1);setSelected(null);};
  const nextMonth=()=>{if(viewMonth===11){setViewYear(y=>y+1);setViewMonth(0);}else setViewMonth(m=>m+1);setSelected(null);};
  const selTxns=selected?byDay[selected]||[]:[];
  const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><h2 style={{fontSize:22,fontWeight:700,color:G.text,marginBottom:3}}>Transaction Calendar</h2><p style={{color:G.muted,fontSize:13}}>{monthTxns.length} transactions this month</p></div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={prevMonth} style={{background:G.card2,border:`1px solid ${G.border}`,borderRadius:9,padding:"7px 12px",cursor:"pointer",color:G.text,fontSize:16}}>‹</button>
          <span style={{fontWeight:700,fontSize:14,color:G.text,minWidth:140,textAlign:"center"}}>{monthName}</span>
          <button onClick={nextMonth} style={{background:G.card2,border:`1px solid ${G.border}`,borderRadius:9,padding:"7px 12px",cursor:"pointer",color:G.text,fontSize:16}}>›</button>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:12}}>
        <StatCard label="Income" value={fmt(totalIncome)} color={G.teal} icon="💰"/>
        <StatCard label="Expenses" value={fmt(totalExpense)} color={G.red} icon="📤"/>
        <StatCard label="Net" value={fmt(totalIncome-totalExpense)} color={(totalIncome-totalExpense)>=0?G.teal:G.red} icon="📊"/>
      </div>
      <Card style={{padding:16}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:8}}>
          {DAYS.map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:G.muted,padding:"4px 0",letterSpacing:.5}}>{d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
          {Array.from({length:firstDay},(_,i)=><div key={`e${i}`}/>)}
          {Array.from({length:daysInMonth},(_,i)=>{
            const day=i+1;const txns=byDay[day]||[];const hasInc=txns.some(t=>t.type==="income");const hasExp=txns.some(t=>t.type==="expense");const isToday=viewYear===now.getFullYear()&&viewMonth===now.getMonth()&&day===now.getDate();const isSel=selected===day;
            return(
              <button key={day} onClick={()=>setSelected(isSel?null:day)} style={{aspectRatio:"1",borderRadius:10,border:`1.5px solid ${isSel?G.teal:isToday?G.gold:"transparent"}`,background:isSel?`${G.teal}18`:isToday?`${G.gold}10`:txns.length?G.card2:"transparent",cursor:txns.length?"pointer":"default",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,padding:2,transition:"all .15s"}}>
                <span style={{fontSize:isMobile?11:13,fontWeight:isToday?700:400,color:isSel?G.teal:isToday?G.gold:txns.length?G.text:G.muted}}>{day}</span>
                {txns.length>0&&<div style={{display:"flex",gap:2,justifyContent:"center"}}>
                  {hasInc&&<div style={{width:4,height:4,borderRadius:"50%",background:G.teal}}/>}
                  {hasExp&&<div style={{width:4,height:4,borderRadius:"50%",background:G.red}}/>}
                </div>}
              </button>
            );
          })}
        </div>
        <div style={{display:"flex",gap:16,marginTop:12,paddingTop:12,borderTop:`1px solid ${G.border}`,fontSize:11,color:G.muted}}>
          <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:8,height:8,borderRadius:"50%",background:G.teal}}/> Income</div>
          <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:8,height:8,borderRadius:"50%",background:G.red}}/> Expense</div>
          <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:12,height:12,borderRadius:3,background:`${G.gold}20`,border:`1px solid ${G.gold}`}}/> Today</div>
        </div>
      </Card>
      {selected&&selTxns.length>0&&(
        <Card>
          <div style={{fontWeight:700,fontSize:15,color:G.text,marginBottom:12}}>{new Date(viewYear,viewMonth,selected).toLocaleDateString("default",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {selTxns.map(t=><div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:G.card2,borderRadius:10,border:`1px solid ${G.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:t.type==="income"?G.teal:G.red,flexShrink:0}}/>
                <div><div style={{fontSize:13,fontWeight:600,color:G.text}}>{t.desc}</div><div style={{fontSize:11,color:G.muted}}><Pill label={t.category} color={CAT_COLOR[t.category]||G.muted}/></div></div>
              </div>
              <span style={{fontWeight:700,color:t.type==="income"?G.teal:G.red,fontSize:14,fontFamily:"monospace"}}>{t.type==="income"?"+":"-"}{fmt(t.amount)}</span>
            </div>)}
            <div style={{display:"flex",justifyContent:"space-between",padding:"8px 14px",background:G.card2,borderRadius:10,border:`1px solid ${G.border}`,fontWeight:600,fontSize:13}}>
              <span style={{color:G.muted}}>Day Total</span>
              <span style={{color:(selTxns.filter(t=>t.type==="income").reduce((a,b)=>a+b.amount,0)-selTxns.filter(t=>t.type==="expense").reduce((a,b)=>a+b.amount,0))>=0?G.teal:G.red,fontFamily:"monospace"}}>
                {fmt(selTxns.filter(t=>t.type==="income").reduce((a,b)=>a+b.amount,0)-selTxns.filter(t=>t.type==="expense").reduce((a,b)=>a+b.amount,0))}
              </span>
            </div>
          </div>
        </Card>
      )}
      {selected&&selTxns.length===0&&<Card style={{textAlign:"center",padding:30,color:G.muted,fontSize:13}}>No transactions on this day</Card>}
    </div>
  );
}

function calcPayoff(cards,extra,method){
  let deck=cards.filter(c=>c.balance>0.01).map(c=>({...c}));
  if(!deck.length)return{months:0,interest:0,schedule:[]};
  if(method==="avalanche")deck.sort((a,b)=>b.apr-a.apr);else deck.sort((a,b)=>a.balance-b.balance);
  let months=0,totalInt=0;const schedule=[];
  while(deck.some(c=>c.balance>0.01)&&months<600){
    months++;let mInt=0;
    deck.forEach(c=>{if(c.balance>0.01){const i=c.balance*(c.apr/100/12);c.balance+=i;totalInt+=i;mInt+=i;}});
    deck.forEach(c=>{if(c.balance>0.01){const p=Math.min(c.balance,Math.max(c.minPayment,25));c.balance=Math.max(0,c.balance-p);}});
    let rem=extra;for(const c of deck){if(c.balance>0.01&&rem>0){const p=Math.min(c.balance,rem);c.balance=Math.max(0,c.balance-p);rem-=p;}}
    schedule.push({month:months,balance:parseFloat(deck.reduce((a,b)=>a+b.balance,0).toFixed(2)),interest:parseFloat(mInt.toFixed(2))});
    deck=deck.filter(c=>c.balance>0.01);
  }
  return{months,interest:parseFloat(totalInt.toFixed(2)),schedule};
}

/* ── UI PRIMITIVES ── */
function Card({children,style={},onClick}){const G=useG();return <div onClick={onClick} style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:20,boxShadow:G.shadow,...style,cursor:onClick?"pointer":undefined}}>{children}</div>;}
function Pill({label,color}){return <span style={{background:`${color}18`,color,border:`1px solid ${color}30`,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{label}</span>;}
function Btn({children,onClick,color,outline=false,small=false,style={},disabled=false}){const G=useG();const c=color||G.teal;return <button onClick={onClick} disabled={disabled} style={{background:outline?"transparent":c,color:outline?c:"#fff",border:`1.5px solid ${c}`,borderRadius:10,padding:small?"5px 12px":"10px 20px",fontFamily:"inherit",fontWeight:600,fontSize:small?11:13,cursor:disabled?"not-allowed":"pointer",opacity:disabled?.5:1,...style}}>{children}</button>;}
function Modal({title,children,onClose,wide=false}){const G=useG();const isMobile=useIsMobile();return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",backdropFilter:"blur(6px)",display:"flex",alignItems:isMobile?"flex-end":"center",justifyContent:"center",zIndex:1000,padding:isMobile?0:20}} onClick={e=>e.target===e.currentTarget&&onClose()}><div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:isMobile?"20px 20px 0 0":20,padding:24,width:"100%",maxWidth:isMobile?"100%":wide?700:430,maxHeight:isMobile?"92vh":"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.2)"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><span style={{fontWeight:700,fontSize:16,color:G.text}}>{title}</span><button onClick={onClose} style={{background:"none",border:"none",color:G.muted,fontSize:22,cursor:"pointer",lineHeight:1}}>×</button></div>{children}</div></div>;}
function Field({label,children}){const G=useG();return <div><div style={{fontSize:10,color:G.muted,fontWeight:700,letterSpacing:.6,textTransform:"uppercase",marginBottom:6}}>{label}</div>{children}</div>;}
function Inp(props){const G=useG();return <input {...props} style={{background:G.card2,border:`1px solid ${G.border}`,color:G.text,borderRadius:9,padding:"9px 12px",fontFamily:"inherit",fontSize:13,outline:"none",width:"100%",...props.style}}/>;}
function Sel({children,...props}){const G=useG();return <select {...props} style={{background:G.card2,border:`1px solid ${G.border}`,color:G.text,borderRadius:9,padding:"9px 12px",fontFamily:"inherit",fontSize:13,outline:"none",width:"100%",...props.style}}>{children}</select>;}
function StatCard({label,value,sub,color,icon}){const G=useG();const c=color||G.teal;return <Card><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div style={{color:G.muted,fontSize:10,fontWeight:700,letterSpacing:.6,textTransform:"uppercase",marginBottom:8}}>{label}</div><div style={{fontSize:22,fontWeight:700,color:c,fontFamily:"monospace",marginBottom:3}}>{value}</div>{sub&&<div style={{fontSize:11,color:G.muted}}>{sub}</div>}</div><div style={{fontSize:26,opacity:.55}}>{icon}</div></div></Card>;}
function Bar({value,max,color,h=8}){const G=useG();const p=Math.min(100,(value/Math.max(max,1))*100);return <div style={{background:G.border,borderRadius:99,height:h,overflow:"hidden"}}><div style={{height:"100%",borderRadius:99,width:`${p}%`,background:color,transition:"width .6s ease"}}/></div>;}
function TT({active,payload,label,fmt:ttFmt}){const G=useG();if(!active||!payload?.length)return null;const f=ttFmt||(v=>`$${Number(v).toFixed(0)}`);return <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:10,padding:"10px 14px",boxShadow:"0 4px 16px rgba(0,0,0,.12)"}}><div style={{fontWeight:600,marginBottom:4,fontSize:12,color:G.text}}>{label}</div>{payload.map(p=><div key={p.dataKey} style={{color:p.color||p.stroke,fontSize:12,fontFamily:"monospace"}}>{p.name}: {f(p.value)}</div>)}</div>;}

/* ── PDF ── */
function doPDF(transactions,subscriptions,goals,fmt){
  const now=new Date();const tm=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const mt=transactions.filter(t=>t.date.startsWith(tm));const inc=mt.filter(t=>t.type==="income").reduce((a,b)=>a+b.amount,0);const exp=mt.filter(t=>t.type==="expense").reduce((a,b)=>a+b.amount,0);const net=inc-exp;const sub=subscriptions.reduce((a,b)=>a+b.amount,0);
  const cm={};mt.filter(t=>t.type==="expense").forEach(t=>{cm[t.category]=(cm[t.category]||0)+t.amount;});
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>FinTrack Report</title><style>body{font-family:'Segoe UI',sans-serif;color:#111;margin:0;padding:40px;font-size:13px}h1{font-size:24px}h2{font-size:14px;font-weight:700;margin:22px 0 10px;padding-bottom:6px;border-bottom:2px solid #f0f0f0}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}.card{border:1px solid #ddd;border-radius:10px;padding:12px}.lbl{font-size:10px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:4px}.val{font-size:18px;font-weight:700;font-family:monospace}.g{color:#0D9488}.r{color:#DC2626}.b{color:#7C3AED}table{width:100%;border-collapse:collapse;margin-bottom:20px}th{background:#f4f4f4;padding:7px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:#555}td{padding:6px 10px;border-bottom:1px solid #eee;font-size:11px}.footer{text-align:center;color:#aaa;font-size:10px;margin-top:30px;padding-top:16px;border-top:1px solid #eee}@media print{body{padding:20px}}</style></head><body>
  <h1>💼 FinTrack Report · ${now.toLocaleString("default",{month:"long",year:"numeric"})}</h1>
  <div class="grid"><div class="card"><div class="lbl">Income</div><div class="val g">${fmt(inc)}</div></div><div class="card"><div class="lbl">Expenses</div><div class="val r">${fmt(exp)}</div></div><div class="card"><div class="lbl">Net</div><div class="val ${net>=0?"g":"r"}">${fmt(net)}</div></div><div class="card"><div class="lbl">Savings Rate</div><div class="val b">${inc>0?((net/inc)*100).toFixed(1):0}%</div></div><div class="card"><div class="lbl">Subscriptions/mo</div><div class="val r">${fmt(sub)}</div></div><div class="card"><div class="lbl">Goals</div><div class="val b">${goals.length} active</div></div></div>
  <h2>Spending by Category</h2><table><thead><tr><th>Category</th><th>Amount</th></tr></thead><tbody>${Object.entries(cm).sort((a,b)=>b[1]-a[1]).map(([c,v])=>`<tr><td>${c}</td><td style="font-family:monospace">${fmt(v)}</td></tr>`).join("")}</tbody></table>
  <h2>Transactions This Month</h2><table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th style="text-align:right">Amount</th></tr></thead><tbody>${mt.map(t=>`<tr><td>${t.date}</td><td>${t.desc}</td><td>${t.category}</td><td style="text-align:right;font-family:monospace;color:${t.type==="income"?"#0D9488":"#DC2626"}">${t.type==="income"?"+":"-"}${fmt(t.amount)}</td></tr>`).join("")}</tbody></table>
  <h2>Goals</h2><table><thead><tr><th>Goal</th><th>Saved</th><th>Target</th><th>%</th></tr></thead><tbody>${goals.map(g=>`<tr><td>${g.icon} ${g.name}</td><td style="font-family:monospace">${fmt(g.saved)}</td><td style="font-family:monospace">${fmt(g.target)}</td><td>${((g.saved/g.target)*100).toFixed(0)}%</td></tr>`).join("")}</tbody></table>
  <div class="footer">FinTrack Pro · ${now.toISOString().slice(0,10)}</div></body></html>`;
  const w=window.open("","_blank","width=900,height=700");w.document.write(html);w.document.close();setTimeout(()=>w.print(),500);
}

function doExportJSON(data){const b=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`fintrack-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(u);}



/* ══════════════════════════════════════════════════════════════════════════════
   AUTH COMPONENTS — Login, Signup, Forgot Password, User Profile
══════════════════════════════════════════════════════════════════════════════ */

/* ── LOGIN SCREEN ── */
function LoginScreen({onLogin}){
  const G=useG();const isMobile=useIsMobile();
  const[email,setEmail]=useState("");const[pass,setPass]=useState("");
  const[err,setErr]=useState("");const[loading,setLoading]=useState(false);
  const[mode,setMode]=useState("login");// login | signup | forgot
  const[name,setName]=useState("");const[passConfirm,setPassConfirm]=useState("");
  const[msg,setMsg]=useState("");const[showPass,setShowPass]=useState(false);

  const doLogin=async()=>{
    if(!email||!pass){setErr("Enter your email and password.");return;}
    setLoading(true);setErr("");
    try{
      const d=await auth.signIn(email.trim(),pass);
      onLogin(d.user);
    }catch(e){setErr(e.message);}
    setLoading(false);
  };

  const doSignup=async()=>{
    if(!email||!pass||!name){setErr("Fill in all fields.");return;}
    if(pass.length<8){setErr("Password must be at least 8 characters.");return;}
    if(pass!==passConfirm){setErr("Passwords don't match.");return;}
    setLoading(true);setErr("");
    try{
      await auth.signUp(email.trim(),pass,{display_name:name.trim()});
      setMsg("✅ Check your email to confirm your account, then log in.");
      setMode("login");setPass("");setPassConfirm("");setName("");
    }catch(e){setErr(e.message);}
    setLoading(false);
  };

  const doForgot=async()=>{
    if(!email){setErr("Enter your email address.");return;}
    setLoading(true);setErr("");
    try{
      await auth.resetPassword(email.trim());
      setMsg("✅ Password reset link sent — check your email.");
      setMode("login");
    }catch(e){setErr(e.message);}
    setLoading(false);
  };

  const onKey=e=>{if(e.key==="Enter"){mode==="login"?doLogin():mode==="signup"?doSignup():doForgot();}};

  return(
    <div style={{minHeight:"100vh",background:G.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Sora',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0}`}</style>
      <div style={{width:"100%",maxWidth:420}}>
        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{width:56,height:56,borderRadius:16,background:`linear-gradient(135deg,${G.teal},${G.purple})`,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:26,marginBottom:14,boxShadow:`0 8px 24px ${G.teal}40`}}>💼</div>
          <div style={{fontWeight:800,fontSize:26,color:G.text,marginBottom:4}}>FinTrack Pro</div>
          <div style={{color:G.muted,fontSize:13}}>Your personal finance command center</div>
        </div>

        <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:20,padding:32,boxShadow:"0 8px 32px rgba(0,0,0,.08)"}}>
          {/* Tab switcher */}
          {mode!=="forgot"&&<div style={{display:"flex",background:G.card2,borderRadius:10,padding:4,marginBottom:24}}>
            {[["login","Sign In"],["signup","Create Account"]].map(([m,lbl])=><button key={m} onClick={()=>{setMode(m);setErr("");setMsg("");}} style={{flex:1,padding:"8px 0",borderRadius:7,border:"none",background:mode===m?G.card:"transparent",color:mode===m?G.text:G.muted,fontWeight:mode===m?600:400,fontSize:13,cursor:"pointer",fontFamily:"inherit",transition:"all .2s",boxShadow:mode===m?"0 1px 4px rgba(0,0,0,.08)":"none"}}>{lbl}</button>)}
          </div>}

          {mode==="forgot"&&<div style={{marginBottom:20}}>
            <button onClick={()=>{setMode("login");setErr("");setMsg("");}} style={{background:"none",border:"none",color:G.teal,cursor:"pointer",fontSize:13,fontFamily:"inherit",display:"flex",alignItems:"center",gap:4}}>← Back to Sign In</button>
            <div style={{fontWeight:700,fontSize:18,color:G.text,marginTop:12}}>Reset Password</div>
            <div style={{color:G.muted,fontSize:13,marginTop:4}}>Enter your email and we'll send a reset link</div>
          </div>}

          {err&&<div style={{background:`${G.red}12`,border:`1px solid ${G.red}30`,borderRadius:10,padding:"10px 14px",fontSize:13,color:G.red,marginBottom:16}}>⚠️ {err}</div>}
          {msg&&<div style={{background:`${G.teal}12`,border:`1px solid ${G.teal}30`,borderRadius:10,padding:"10px 14px",fontSize:13,color:G.teal,marginBottom:16}}>{msg}</div>}

          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {mode==="signup"&&<div>
              <div style={{fontSize:11,color:G.muted,fontWeight:700,letterSpacing:.6,textTransform:"uppercase",marginBottom:6}}>Full Name</div>
              <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={onKey} placeholder="Mohamed Mohamud" style={{background:G.card2,border:`1px solid ${G.border}`,color:G.text,borderRadius:10,padding:"11px 14px",fontFamily:"inherit",fontSize:14,outline:"none",width:"100%",transition:"border-color .2s"}} onFocus={e=>e.target.style.borderColor=G.teal} onBlur={e=>e.target.style.borderColor=G.border}/>
            </div>}

            <div>
              <div style={{fontSize:11,color:G.muted,fontWeight:700,letterSpacing:.6,textTransform:"uppercase",marginBottom:6}}>Email Address</div>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={onKey} placeholder="you@email.com" style={{background:G.card2,border:`1px solid ${G.border}`,color:G.text,borderRadius:10,padding:"11px 14px",fontFamily:"inherit",fontSize:14,outline:"none",width:"100%"}} onFocus={e=>e.target.style.borderColor=G.teal} onBlur={e=>e.target.style.borderColor=G.border}/>
            </div>

            {mode!=="forgot"&&<div>
              <div style={{fontSize:11,color:G.muted,fontWeight:700,letterSpacing:.6,textTransform:"uppercase",marginBottom:6}}>Password</div>
              <div style={{position:"relative"}}>
                <input type={showPass?"text":"password"} value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={onKey} placeholder={mode==="signup"?"At least 8 characters":"••••••••"} style={{background:G.card2,border:`1px solid ${G.border}`,color:G.text,borderRadius:10,padding:"11px 44px 11px 14px",fontFamily:"inherit",fontSize:14,outline:"none",width:"100%"}} onFocus={e=>e.target.style.borderColor=G.teal} onBlur={e=>e.target.style.borderColor=G.border}/>
                <button onClick={()=>setShowPass(s=>!s)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:G.muted,fontSize:16}}>{showPass?"🙈":"👁️"}</button>
              </div>
            </div>}

            {mode==="signup"&&<div>
              <div style={{fontSize:11,color:G.muted,fontWeight:700,letterSpacing:.6,textTransform:"uppercase",marginBottom:6}}>Confirm Password</div>
              <input type={showPass?"text":"password"} value={passConfirm} onChange={e=>setPassConfirm(e.target.value)} onKeyDown={onKey} placeholder="••••••••" style={{background:G.card2,border:`1px solid ${G.border}`,color:G.text,borderRadius:10,padding:"11px 14px",fontFamily:"inherit",fontSize:14,outline:"none",width:"100%"}} onFocus={e=>e.target.style.borderColor=G.teal} onBlur={e=>e.target.style.borderColor=G.border}/>
              {/* Password strength */}
              {pass.length>0&&<div style={{marginTop:8}}>
                {[{check:pass.length>=8,label:"8+ characters"},{check:/[A-Z]/.test(pass),label:"Uppercase"},{check:/[0-9]/.test(pass),label:"Number"},{check:/[^A-Za-z0-9]/.test(pass),label:"Special char"}].map(({check,label})=><span key={label} style={{display:"inline-flex",alignItems:"center",gap:3,marginRight:10,fontSize:10,color:check?G.green:G.muted}}><span>{check?"✓":"○"}</span>{label}</span>)}
              </div>}
            </div>}

            <button onClick={mode==="login"?doLogin:mode==="signup"?doSignup:doForgot} disabled={loading} style={{background:loading?G.border:`linear-gradient(135deg,${G.teal},${G.purple})`,color:"#fff",border:"none",borderRadius:12,padding:"13px",fontFamily:"inherit",fontWeight:700,fontSize:15,cursor:loading?"not-allowed":"pointer",width:"100%",transition:"opacity .2s",opacity:loading?.7:1}}>
              {loading?"Loading...":{login:"Sign In →",signup:"Create Account →",forgot:"Send Reset Link →"}[mode]}
            </button>

            {mode==="login"&&<button onClick={()=>{setMode("forgot");setErr("");setMsg("");}} style={{background:"none",border:"none",color:G.muted,cursor:"pointer",fontSize:12,fontFamily:"inherit",textAlign:"center"}}>Forgot your password?</button>}
          </div>
        </div>

        <div style={{textAlign:"center",marginTop:20,fontSize:12,color:G.muted}}>
          🔒 Your data is encrypted and stored privately. <br/>We never sell or share your financial data.
        </div>
      </div>
    </div>
  );
}

/* ── USER PROFILE PAGE ── */
function UserProfile({user,onSignOut,showToast,isDark,setIsDark,currency,setCurrencyPref,onClose}){
  const G=useG();const isMobile=useIsMobile();
  const[tab,setTab]=useState("profile");
  const[displayName,setDisplayName]=useState(user?.user_metadata?.display_name||"");
  const[monthlyIncome,setMonthlyIncome]=useState(user?.user_metadata?.monthly_income||"");
  const[payday,setPayday]=useState(user?.user_metadata?.payday||"biweekly");
  const[country,setCountry]=useState(user?.user_metadata?.country||"US");
  const[notifBudget,setNotifBudget]=useState(user?.user_metadata?.notif_budget!==false);
  const[notifBills,setNotifBills]=useState(user?.user_metadata?.notif_bills!==false);
  const[notifWeekly,setNotifWeekly]=useState(user?.user_metadata?.notif_weekly||false);
  const[notifDarkweb,setNotifDarkweb]=useState(user?.user_metadata?.notif_darkweb!==false);
  const[budgetThreshold,setBudgetThreshold]=useState(user?.user_metadata?.budget_threshold||80);
  const[saving,setSaving]=useState(false);
  // Password change
  const[oldPass,setOldPass]=useState("");const[newPass,setNewPass]=useState("");const[newPassConfirm,setNewPassConfirm]=useState("");
  // Dark web
  const[breachResult,setBreachResult]=useState(null);const[breachLoading,setBreachLoading]=useState(false);
  // Sessions
  const[sessions]=useState([{device:"Current Device",time:new Date().toLocaleString(),ip:"(this session)",current:true}]);

  const memberSince=user?.created_at?new Date(user.created_at).toLocaleDateString("default",{month:"long",year:"numeric"}):"—";
  const initials=(displayName||user?.email||"?").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);

  const saveProfile=async()=>{
    setSaving(true);
    try{
      await auth.updateUser({data:{display_name:displayName,monthly_income:parseFloat(monthlyIncome)||0,payday,country,notif_budget:notifBudget,notif_bills:notifBills,notif_weekly:notifWeekly,notif_darkweb:notifDarkweb,budget_threshold:parseInt(budgetThreshold)||80}});
      showToast("Profile saved!");
    }catch(e){showToast(e.message,"error");}
    setSaving(false);
  };

  const changePassword=async()=>{
    if(!newPass||newPass.length<8){showToast("Password must be 8+ characters","error");return;}
    if(newPass!==newPassConfirm){showToast("Passwords don't match","error");return;}
    setSaving(true);
    try{await auth.updatePassword(newPass);showToast("Password updated!");setOldPass("");setNewPass("");setNewPassConfirm("");}
    catch(e){showToast(e.message,"error");}
    setSaving(false);
  };

  const checkDarkWeb=async()=>{
    setBreachLoading(true);setBreachResult(null);
    try{
      const r=await fetch(`https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(user.email)}`,{headers:{"User-Agent":"FinTrack-Pro"}});
      if(r.status===404){setBreachResult({safe:true,count:0,breaches:[]});}
      else if(r.status===200){const d=await r.json();setBreachResult({safe:false,count:d.length,breaches:d.slice(0,5)});}
      else{setBreachResult({error:true});}
    }catch{
      // HIBP blocks direct browser requests — show instruction
      setBreachResult({browserBlock:true});
    }
    setBreachLoading(false);
  };

  const PROFILE_TABS=[["profile","👤 Profile"],["security","🔒 Security"],["notifications","🔔 Notifications"],["privacy","🛡️ Privacy"]];

  return(
    <Modal title="My Profile" onClose={onClose} wide>
      {/* Profile header */}
      <div style={{display:"flex",alignItems:"center",gap:16,padding:"0 0 20px",borderBottom:`1px solid ${G.border}`,marginBottom:20}}>
        <div style={{width:56,height:56,borderRadius:"50%",background:`linear-gradient(135deg,${G.teal},${G.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:700,color:"#fff",flexShrink:0}}>{initials}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:16,color:G.text,marginBottom:2}}>{displayName||"Your Name"}</div>
          <div style={{fontSize:12,color:G.muted,marginBottom:4}}>{user?.email}</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <Pill label={`Member since ${memberSince}`} color={G.teal}/>
            {auth.isAdmin()&&<Pill label="Admin" color={G.purple}/>}
          </div>
        </div>
        <Btn small outline color={G.red} onClick={onSignOut}>Sign Out</Btn>
      </div>

      {/* Tab nav */}
      <div style={{display:"flex",gap:4,marginBottom:20,flexWrap:"wrap"}}>
        {PROFILE_TABS.map(([id,lbl])=><button key={id} onClick={()=>setTab(id)} style={{padding:"7px 14px",borderRadius:8,border:`1px solid ${tab===id?G.teal:G.border}`,background:tab===id?`${G.teal}14`:"transparent",color:tab===id?G.teal:G.muted,fontSize:12,fontWeight:tab===id?600:400,cursor:"pointer",fontFamily:"inherit"}}>{lbl}</button>)}
      </div>

      {/* ── PROFILE TAB ── */}
      {tab==="profile"&&<div style={{display:"flex",flexDirection:"column",gap:16}}>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
          <Field label="Display Name"><Inp value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Your full name"/></Field>
          <Field label="Email"><Inp value={user?.email||""} disabled style={{opacity:.6}}/></Field>
          <Field label="Monthly Income Target"><Inp type="number" value={monthlyIncome} onChange={e=>setMonthlyIncome(e.target.value)} placeholder="5000"/></Field>
          <Field label="Payday Schedule"><Sel value={payday} onChange={e=>setPayday(e.target.value)}>
            <option value="weekly">Weekly</option><option value="biweekly">Bi-weekly (Every 2 weeks)</option>
            <option value="semimonthly">Semi-monthly (1st & 15th)</option><option value="monthly">Monthly</option>
          </Sel></Field>
          <Field label="Country / Region"><Sel value={country} onChange={e=>setCountry(e.target.value)}>
            <option value="US">🇺🇸 United States</option><option value="CA">🇨🇦 Canada</option><option value="GB">🇬🇧 United Kingdom</option>
            <option value="SO">🇸🇴 Somalia</option><option value="ET">🇪🇹 Ethiopia</option><option value="KE">🇰🇪 Kenya</option>
            <option value="AE">🇦🇪 UAE</option><option value="SA">🇸🇦 Saudi Arabia</option><option value="Other">🌍 Other</option>
          </Sel></Field>
          <Field label="Currency"><Sel value={currency} onChange={e=>setCurrencyPref(e.target.value)}>
            {CURRENCIES.map(c=><option key={c.code} value={c.code}>{c.symbol} {c.name}</option>)}
          </Sel></Field>
          <Field label="App Theme"><div style={{display:"flex",gap:10}}>
            {[["☀️ Light",false],["🌙 Dark",true]].map(([lbl,val])=><button key={lbl} onClick={()=>setIsDark(val)} style={{flex:1,padding:"9px",borderRadius:9,border:`1.5px solid ${isDark===val?G.teal:G.border}`,background:isDark===val?`${G.teal}14`:"transparent",color:isDark===val?G.teal:G.muted,cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:isDark===val?600:400}}>{lbl}</button>)}
          </div></Field>
        </div>
        <Btn onClick={saveProfile} disabled={saving} style={{alignSelf:"flex-start"}}>{saving?"Saving...":"Save Profile"}</Btn>
      </div>}

      {/* ── SECURITY TAB ── */}
      {tab==="security"&&<div style={{display:"flex",flexDirection:"column",gap:20}}>
        <Card>
          <div style={{fontWeight:600,fontSize:14,color:G.text,marginBottom:14}}>🔑 Change Password</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <Field label="New Password"><Inp type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} placeholder="At least 8 characters"/></Field>
            <Field label="Confirm New Password"><Inp type="password" value={newPassConfirm} onChange={e=>setNewPassConfirm(e.target.value)} placeholder="••••••••"/></Field>
            {newPass.length>0&&<div>{[{check:newPass.length>=8,label:"8+ chars"},{check:/[A-Z]/.test(newPass),label:"Uppercase"},{check:/[0-9]/.test(newPass),label:"Number"}].map(({check,label})=><span key={label} style={{display:"inline-flex",alignItems:"center",gap:3,marginRight:10,fontSize:10,color:check?G.green:G.muted}}><span>{check?"✓":"○"}</span>{label}</span>)}</div>}
            <Btn onClick={changePassword} disabled={saving} style={{alignSelf:"flex-start"}}>{saving?"Updating...":"Update Password"}</Btn>
          </div>
        </Card>
        <Card>
          <div style={{fontWeight:600,fontSize:14,color:G.text,marginBottom:6}}>🌐 Active Sessions</div>
          <div style={{fontSize:12,color:G.muted,marginBottom:12}}>Devices where your account is signed in</div>
          {sessions.map((s,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:G.card2,borderRadius:9,border:`1px solid ${G.border}`,marginBottom:6}}>
            <div><div style={{fontSize:13,fontWeight:500,color:G.text}}>{s.device}</div><div style={{fontSize:11,color:G.muted}}>{s.time}</div></div>
            {s.current?<Pill label="Current" color={G.teal}/>:<Btn small outline color={G.red}>Revoke</Btn>}
          </div>)}
        </Card>
        <Card style={{borderColor:`${G.red}40`}}>
          <div style={{fontWeight:600,fontSize:14,color:G.red,marginBottom:6}}>⚠️ Danger Zone</div>
          <div style={{fontSize:12,color:G.muted,marginBottom:12}}>These actions are permanent and cannot be undone.</div>
          <Btn outline color={G.red} onClick={()=>{if(window.confirm("Delete your account and ALL data permanently? This cannot be undone.")){auth.signOut();showToast("Contact support to complete deletion");}}}>Delete My Account</Btn>
        </Card>
      </div>}

      {/* ── NOTIFICATIONS TAB ── */}
      {tab==="notifications"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
        {[
          [notifBudget,setNotifBudget,"💰 Budget Alerts",`Alert when spending hits ${budgetThreshold}% of any category limit`],
          [notifBills,setNotifBills,"📅 Bill Reminders","Alert when a subscription is due in 3 days"],
          [notifWeekly,setNotifWeekly,"📊 Weekly Summary","Email digest of your finances every Sunday"],
          [notifDarkweb,setNotifDarkweb,"🔐 Dark Web Alerts","Alert if your email appears in a data breach"],
        ].map(([val,setter,label,sub])=><div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",background:G.card2,borderRadius:12,border:`1px solid ${G.border}`}}>
          <div><div style={{fontWeight:500,fontSize:13,color:G.text}}>{label}</div><div style={{fontSize:11,color:G.muted}}>{sub}</div></div>
          <button onClick={()=>setter(v=>!v)} style={{width:44,height:24,borderRadius:99,background:val?G.teal:G.border,border:"none",cursor:"pointer",position:"relative",flexShrink:0}}><div style={{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:val?22:3,transition:"left .2s"}}/></button>
        </div>)}
        <Field label={`Budget Alert Threshold: ${budgetThreshold}%`}>
          <input type="range" min={50} max={95} step={5} value={budgetThreshold} onChange={e=>setBudgetThreshold(e.target.value)} style={{width:"100%",accentColor:G.teal}}/>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:G.muted,marginTop:4}}><span>50%</span><span>95%</span></div>
        </Field>
        <Btn onClick={saveProfile} disabled={saving} style={{alignSelf:"flex-start"}}>{saving?"Saving...":"Save Preferences"}</Btn>
      </div>}

      {/* ── PRIVACY TAB ── */}
      {tab==="privacy"&&<div style={{display:"flex",flexDirection:"column",gap:16}}>
        <Card>
          <div style={{fontWeight:600,fontSize:14,color:G.text,marginBottom:8}}>🔐 Dark Web Monitoring</div>
          <div style={{fontSize:12,color:G.muted,marginBottom:14}}>Check if your email has appeared in any known data breaches using HaveIBeenPwned.</div>
          <Btn onClick={checkDarkWeb} disabled={breachLoading}>{breachLoading?"Checking...":"Check My Email Now"}</Btn>
          {breachResult&&<div style={{marginTop:14}}>
            {breachResult.browserBlock&&<div style={{background:`${G.gold}12`,border:`1px solid ${G.gold}30`,borderRadius:10,padding:"12px 14px",fontSize:12,color:G.text}}>
              <div style={{fontWeight:600,marginBottom:4}}>🌐 Check Manually</div>
              <div style={{color:G.muted}}>Browser security blocks direct API calls. Visit <a href={`https://haveibeenpwned.com/account/${encodeURIComponent(user?.email)}`} target="_blank" rel="noreferrer" style={{color:G.teal}}>haveibeenpwned.com</a> and search <strong>{user?.email}</strong></div>
            </div>}
            {breachResult.safe&&<div style={{background:`${G.green}12`,border:`1px solid ${G.green}30`,borderRadius:10,padding:"12px 14px",fontSize:12,color:G.green}}><div style={{fontWeight:600,marginBottom:2}}>✅ Good news — no breaches found!</div><div style={{color:G.muted}}>Your email wasn't found in any known data breaches.</div></div>}
            {!breachResult.safe&&!breachResult.browserBlock&&!breachResult.error&&<div style={{background:`${G.red}12`,border:`1px solid ${G.red}30`,borderRadius:10,padding:"12px 14px",fontSize:12}}>
              <div style={{fontWeight:600,color:G.red,marginBottom:8}}>⚠️ Found in {breachResult.count} breach{breachResult.count!==1?"es":""}</div>
              {breachResult.breaches.map(b=><div key={b.Name} style={{marginBottom:6,paddingBottom:6,borderBottom:`1px solid ${G.border}`}}><div style={{fontWeight:500,color:G.text}}>{b.Title} ({b.BreachDate?.slice(0,4)})</div><div style={{color:G.muted,fontSize:11}}>Data exposed: {b.DataClasses?.join(", ")}</div></div>)}
              <div style={{marginTop:8,color:G.text,fontWeight:500}}>Action: Change your password immediately if you use the same password elsewhere.</div>
            </div>}
          </div>}
        </Card>
        <Card>
          <div style={{fontWeight:600,fontSize:14,color:G.text,marginBottom:8}}>📦 Your Data</div>
          <div style={{fontSize:12,color:G.muted,marginBottom:14}}>FinTrack Pro stores your data in a private Supabase database. Only you can access it via your account. We do not sell, share, or analyze your financial data.</div>
          <div style={{display:"flex",flexDirection:"column",gap:8,fontSize:12,color:G.muted}}>
            {["✅ Data stored in your private database row","✅ Row Level Security — database rejects cross-user queries","✅ Passwords hashed with bcrypt — never stored in plain text","✅ Session tokens expire automatically","✅ No ads. No tracking. No third-party analytics"].map(item=><div key={item}>{item}</div>)}
          </div>
        </Card>
      </div>}
    </Modal>
  );
}

/* ── EMAIL CONFIRMATION BANNER ── */
function ConfirmBanner({email}){
  const G=useG();
  return(
    <div style={{background:`${G.gold}18`,border:`1px solid ${G.gold}40`,borderRadius:12,padding:"12px 18px",display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
      <span style={{fontSize:20}}>📧</span>
      <div style={{flex:1}}>
        <div style={{fontWeight:600,fontSize:13,color:G.gold}}>Confirm your email</div>
        <div style={{fontSize:12,color:G.muted}}>We sent a confirmation link to <strong>{email}</strong>. Check your inbox to unlock all features.</div>
      </div>
    </div>
  );
}

/* ── DASHBOARD ── */
function Dashboard({transactions,budgets,subscriptions,goals,netWorthHistory,fmt}){
  const G=useG();const isMobile=useIsMobile();const now=new Date();
  const prevMonthDate=new Date(now.getFullYear(),now.getMonth()-1,1);
  const tm=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const pm=`${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth()+1).padStart(2,"0")}`;
  const mt=transactions.filter(t=>t.date.startsWith(tm));const prevExp=transactions.filter(t=>t.date.startsWith(pm)&&t.type==="expense").reduce((a,b)=>a+b.amount,0);
  const income=mt.filter(t=>t.type==="income").reduce((a,b)=>a+b.amount,0);const expense=mt.filter(t=>t.type==="expense").reduce((a,b)=>a+b.amount,0);const net=income-expense;
  const weeks=Array.from({length:8},(_,i)=>{const end=new Date();end.setDate(end.getDate()-i*7);const start=new Date(end);start.setDate(start.getDate()-6);const s=start.toISOString().slice(0,10);const e=end.toISOString().slice(0,10);return{week:`W${8-i}`,spent:transactions.filter(t=>t.type==="expense"&&t.date>=s&&t.date<=e).reduce((a,b)=>a+b.amount,0)};}).reverse();
  const months=Array.from({length:6},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-5+i,1);const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;return{month:d.toLocaleString("default",{month:"short"}),income:transactions.filter(t=>t.date.startsWith(k)&&t.type==="income").reduce((a,b)=>a+b.amount,0),expenses:transactions.filter(t=>t.date.startsWith(k)&&t.type==="expense").reduce((a,b)=>a+b.amount,0)};});
  const cm={};mt.filter(t=>t.type==="expense").forEach(t=>{cm[t.category]=(cm[t.category]||0)+t.amount;});
  const pieData=Object.entries(cm).map(([name,value])=>({name,value:parseFloat(value.toFixed(2))})).sort((a,b)=>b.value-a.value).slice(0,6);
  const today=now.getDate();const billsAlert=subscriptions.filter(s=>s.due-today>=0&&s.due-today<=3);
  const anomalies=[];if(prevExp>0&&expense>prevExp*1.3)anomalies.push(`Spending up ${(((expense-prevExp)/prevExp)*100).toFixed(0)}% vs last month`);
  Object.entries(cm).forEach(([cat,amt])=>{const p=transactions.filter(t=>t.date.startsWith(pm)&&t.type==="expense"&&t.category===cat).reduce((a,b)=>a+b.amount,0);if(p>0&&amt>p*2)anomalies.push(`${cat} spending doubled vs last month`);});
  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
        <div><h2 style={{fontSize:22,fontWeight:700,color:G.text,marginBottom:3}}>Financial Overview</h2><p style={{color:G.muted,fontSize:13}}>{now.toLocaleString("default",{month:"long",year:"numeric"})}</p></div>
        <Btn onClick={()=>doPDF(transactions,subscriptions,goals,fmt)}>📄 Export PDF</Btn>
      </div>
      {billsAlert.length>0&&<div style={{background:`${G.gold}15`,border:`1px solid ${G.gold}40`,borderRadius:12,padding:"12px 16px",display:"flex",gap:10,alignItems:"center"}}><span style={{fontSize:20}}>⚠️</span><div><div style={{fontWeight:600,fontSize:13,color:G.gold}}>Bills Due Soon</div><div style={{fontSize:12,color:G.muted}}>{billsAlert.map(s=>`${s.name} — Day ${s.due}`).join(" · ")}</div></div></div>}
      {anomalies.length>0&&<div style={{background:`${G.red}10`,border:`1px solid ${G.red}30`,borderRadius:12,padding:"12px 16px"}}><div style={{fontWeight:600,fontSize:12,color:G.red,marginBottom:4}}>📈 Spending Alerts</div>{anomalies.map((a,i)=><div key={i} style={{fontSize:12,color:G.muted}}>• {a}</div>)}</div>}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:12}}>
        <StatCard label="Income"    value={fmt(income)}  color={G.teal}            icon="💰"/>
        <StatCard label="Expenses"  value={fmt(expense)} color={G.red}             icon="📤"/>
        <StatCard label="Net"       value={fmt(net)}     color={net>=0?G.teal:G.red} icon="📊"/>
        <StatCard label="Saved"     value={`${income>0?((net/income)*100).toFixed(1):0}%`} color={G.gold} icon="🎯"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1.6fr 1fr",gap:12}}>
        <Card>
          <div style={{fontWeight:600,marginBottom:14,fontSize:13,color:G.text}}>6-Month Trend</div>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={months}>
              <defs><linearGradient id="gi" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={G.teal} stopOpacity={.25}/><stop offset="95%" stopColor={G.teal} stopOpacity={0}/></linearGradient><linearGradient id="ge" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={G.red} stopOpacity={.25}/><stop offset="95%" stopColor={G.red} stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke={G.border}/><XAxis dataKey="month" tick={{fill:G.muted,fontSize:11}} axisLine={false} tickLine={false}/><YAxis tick={{fill:G.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>fmt(v)}/>
              <Tooltip content={<TT fmt={fmt}/>}/>
              <Area type="monotone" dataKey="income" name="Income" stroke={G.teal} fill="url(#gi)" strokeWidth={2}/>
              <Area type="monotone" dataKey="expenses" name="Expenses" stroke={G.red} fill="url(#ge)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <div style={{fontWeight:600,marginBottom:12,fontSize:13,color:G.text}}>Spending Breakdown</div>
          {pieData.length?<><ResponsiveContainer width="100%" height={130}><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={38} outerRadius={62} dataKey="value" paddingAngle={3}>{pieData.map((e,i)=><Cell key={i} fill={CAT_COLOR[e.name]||G.muted}/>)}</Pie><Tooltip content={<TT fmt={fmt}/>}/></PieChart></ResponsiveContainer>
          <div style={{display:"flex",flexDirection:"column",gap:5,marginTop:6}}>{pieData.slice(0,4).map(e=><div key={e.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:7,height:7,borderRadius:"50%",background:CAT_COLOR[e.name]||G.muted}}/><span style={{fontSize:11,color:G.muted}}>{e.name}</span></div><span style={{fontSize:11,color:G.text,fontFamily:"monospace"}}>{fmt(e.value)}</span></div>)}</div>
          </>:<div style={{color:G.muted,fontSize:12,textAlign:"center",paddingTop:50}}>No expenses yet</div>}
        </Card>
      </div>
      <Card>
        <div style={{fontWeight:600,marginBottom:14,fontSize:13,color:G.text}}>Weekly Spending (Last 8 Weeks)</div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={weeks}>
            <CartesianGrid strokeDasharray="3 3" stroke={G.border}/>
            <XAxis dataKey="week" tick={{fill:G.muted,fontSize:10}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:G.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>fmt(v)}/>
            <Tooltip formatter={v=>fmt(v)} contentStyle={{background:G.card,border:`1px solid ${G.border}`,borderRadius:8,fontSize:12}}/>
            <RBar dataKey="spent" name="Spending" fill={G.red} radius={[4,4,0,0]} fillOpacity={0.8}/>
          </BarChart>
        </ResponsiveContainer>
      </Card>
      {netWorthHistory.length>1&&<Card><div style={{fontWeight:600,marginBottom:14,fontSize:13,color:G.text}}>Net Worth History</div><ResponsiveContainer width="100%" height={160}><AreaChart data={netWorthHistory}><defs><linearGradient id="gnw" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={G.purple} stopOpacity={.25}/><stop offset="95%" stopColor={G.purple} stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke={G.border}/><XAxis dataKey="date" tick={{fill:G.muted,fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:G.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`$${(v/1000).toFixed(0)}k`}/><Tooltip content={<TT/>}/><Area type="monotone" dataKey="netWorth" name="Net Worth" stroke={G.purple} fill="url(#gnw)" strokeWidth={2}/></AreaChart></ResponsiveContainer></Card>}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:12}}>
        <StatCard label="Subscriptions/mo" value={fmt(subscriptions.reduce((a,b)=>a+b.amount,0))} color={G.purple} icon="🔄"/>
        <StatCard label="Annual Sub Cost"   value={fmt(subscriptions.reduce((a,b)=>a+b.amount,0)*12)} color={G.red} icon="📅"/>
        <StatCard label="Total Saved"       value={fmt(goals.reduce((a,b)=>a+b.saved,0))} color={G.gold} icon="🏆"/>
      </div>
      <Card>
        <div style={{fontWeight:600,marginBottom:14,fontSize:13,color:G.text}}>Budget Status This Month</div>
        {budgets&&budgets.length>0?(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {budgets.slice(0,5).map(b=>{const s=mt.filter(t=>t.type==="expense"&&t.category===b.category).reduce((a,x)=>a+x.amount,0);const eff=(b.limit||0)+(b.rollover||0);const p=Math.min(100,(s/Math.max(eff,1))*100);const over=s>eff;return <div key={b.category}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:G.text}}>{b.category}</span><span style={{fontSize:12,fontFamily:"monospace",color:over?G.red:G.muted}}>{fmt(s)} / {fmt(eff)}</span></div><Bar value={s} max={eff} color={over?G.red:p>80?G.gold:CAT_COLOR[b.category]||G.teal} h={5}/></div>;})}
            {budgets.length>5&&<div style={{fontSize:11,color:G.muted,textAlign:"center"}}>+{budgets.length-5} more categories</div>}
          </div>
        ):<div style={{color:G.muted,fontSize:12,textAlign:"center",padding:16}}>No budget set up yet</div>}
      </Card>
      <Card><div style={{fontWeight:600,marginBottom:12,fontSize:13,color:G.text}}>Recent Transactions</div><div style={{display:"flex",flexDirection:"column",gap:6}}>{transactions.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6).map(t=><div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",background:G.card2,borderRadius:9,border:`1px solid ${G.border}`}}><div style={{display:"flex",alignItems:"center",gap:9}}><div style={{width:7,height:7,borderRadius:"50%",background:t.type==="income"?G.teal:G.red,flexShrink:0}}/><div><div style={{fontSize:13,fontWeight:500,color:G.text}}>{t.desc}</div><div style={{fontSize:11,color:G.muted}}>{t.date} · {t.category}{t.note?` · ${t.note}`:""}</div></div></div><span style={{fontWeight:700,color:t.type==="income"?G.teal:G.red,fontSize:13,fontFamily:"monospace"}}>{t.type==="income"?"+":"-"}{fmt(t.amount)}</span></div>)}</div></Card>
    </div>
  );
}

/* ── TRANSACTIONS ── */
function Transactions({transactions,setTransactions,showToast,fmt}){
  const G=useG();const isMobile=useIsMobile();const [modal,setModal]=useState(false);const [editTxn,setEditTxn]=useState(null);const [csvModal,setCsvModal]=useState(false);const [filter,setFilter]=useState("all");const [search,setSearch]=useState("");
  const today=new Date().toISOString().slice(0,10);const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
  const [form,setForm]=useState({date:today,desc:"",amount:"",type:"expense",category:"Food",note:""});const [csvData,setCsvData]=useState(null);const [mapping,setMapping]=useState({date:"",desc:"",amount:"",type:"",category:""});const [csvMsg,setCsvMsg]=useState("");const fileRef=useRef();
  const filtered=transactions.filter(t=>filter==="all"||t.type===filter).filter(t=>t.desc.toLowerCase().includes(search.toLowerCase())||t.category.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>b.date.localeCompare(a.date));
  const add=async()=>{if(!form.date||!form.desc||!form.amount)return;const u=[{id:uid(),...form,amount:parseFloat(form.amount)},...transactions];setTransactions(u);await store.set("transactions",u);setModal(false);setForm({date:today,desc:"",amount:"",type:"expense",category:"Food",note:""});showToast("Transaction added");};
  const del=async id=>{if(!window.confirm("Delete this transaction?"))return;const u=transactions.filter(t=>t.id!==id);setTransactions(u);await store.set("transactions",u);showToast("Deleted");};
  const delAll=async()=>{if(!window.confirm(`Delete ALL ${transactions.length} transactions?`))return;setTransactions([]);await store.set("transactions",[]);showToast("All transactions deleted");};
  const openEdit=t=>{setEditTxn({...t,amount:String(t.amount)});};
  const saveEdit=async()=>{if(!editTxn.date||!editTxn.desc||!editTxn.amount)return;const u=transactions.map(t=>t.id===editTxn.id?{...editTxn,amount:parseFloat(editTxn.amount)}:t);setTransactions(u);await store.set("transactions",u);setEditTxn(null);showToast("Transaction updated");};
  const handleCSV=e=>{const f=e.target.files[0];if(!f)return;Papa.parse(f,{header:true,skipEmptyLines:true,complete:r=>{setCsvData(r);const c=r.meta.fields||[];const g=ks=>c.find(x=>ks.some(k=>x.toLowerCase().includes(k)))||"";setMapping({date:g(["date","time","posted"]),desc:g(["desc","name","merchant","memo","payee"]),amount:g(["amount","debit","credit","sum"]),type:g(["type","credit","debit"]),category:g(["category","cat"])});setCsvMsg(`Loaded ${r.data.length} rows.`);},error:()=>setCsvMsg("Failed to parse.")});};
  const importCSV=async()=>{if(!csvData||!mapping.date||!mapping.desc||!mapping.amount){setCsvMsg("Map Date, Description, and Amount first.");return;}const imp=csvData.data.map(row=>{const raw=parseFloat((row[mapping.amount]||"0").replace(/[^0-9.\-]/g,""));const isInc=raw>0||(mapping.type&&row[mapping.type]?.toLowerCase().includes("credit"));const desc=(row[mapping.desc]||"").trim()||"Imported";const manualCat=mapping.category&&row[mapping.category]?.trim();const category=manualCat||autoCategory(desc);return{id:uid(),date:(row[mapping.date]||"").trim().slice(0,10)||new Date().toISOString().slice(0,10),desc,amount:Math.abs(raw),type:isInc?"income":"expense",category,note:""};}).filter(t=>t.amount>0);const u=[...imp,...transactions];setTransactions(u);await store.set("transactions",u);setCsvModal(false);setCsvData(null);setCsvMsg("");showToast(`${imp.length} transactions imported with auto-categories`);};
  const cols=csvData?.meta?.fields||[];
  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}><div><h2 style={{fontSize:22,fontWeight:700,color:G.text,marginBottom:3}}>Transactions</h2><p style={{color:G.muted,fontSize:13}}>{filtered.length} records</p></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{transactions.length>0&&<Btn small outline color={G.red} onClick={delAll}>🗑️ Delete All</Btn>}<Btn small outline onClick={()=>setCsvModal(true)}>📂 Import CSV</Btn><Btn small onClick={()=>setModal(true)}>+ Add</Btn></div></div>
      <div style={{display:"flex",gap:10}}><Inp value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." style={{flex:1}}/><Sel value={filter} onChange={e=>setFilter(e.target.value)} style={{minWidth:130}}><option value="all">All</option><option value="income">Income</option><option value="expense">Expenses</option></Sel></div>
      {isMobile?(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtered.length===0&&<div style={{textAlign:"center",padding:60,color:G.muted,fontSize:13}}>No transactions found</div>}
          {filtered.map(t=><div key={t.id} style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:12,padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:t.type==="income"?G.teal:G.red,flexShrink:0}}/>
              <div style={{minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:G.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.desc}</div>
                <div style={{fontSize:11,color:G.muted}}>{t.date} · {t.category}</div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
              <span style={{fontWeight:700,color:t.type==="income"?G.teal:G.red,fontSize:14,fontFamily:"monospace"}}>{t.type==="income"?"+":"-"}{fmt(t.amount)}</span>
              <button onClick={()=>openEdit(t)} style={{background:"none",border:"none",color:G.muted,cursor:"pointer",fontSize:14,padding:2}}>✏️</button>
              <button onClick={()=>del(t.id)} style={{background:"none",border:"none",color:G.muted,cursor:"pointer",fontSize:14,padding:2}}>✕</button>
            </div>
          </div>)}
        </div>
      ):(
        <Card style={{padding:0,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"100px 1fr 120px 110px 100px 70px",padding:"9px 18px",borderBottom:`1px solid ${G.border}`,color:G.muted,fontSize:10,fontWeight:700,letterSpacing:.8,textTransform:"uppercase"}}><span>Date</span><span>Description</span><span>Category</span><span style={{textAlign:"right"}}>Amount</span><span>Note</span><span/></div>
          <div style={{maxHeight:480,overflowY:"auto"}}>{filtered.length===0&&<div style={{textAlign:"center",padding:60,color:G.muted,fontSize:13}}>No transactions found</div>}{filtered.map((t,i)=><div key={t.id} style={{display:"grid",gridTemplateColumns:"100px 1fr 120px 110px 100px 70px",padding:"11px 18px",borderBottom:`1px solid ${G.border}22`,alignItems:"center",background:i%2===0?"transparent":G.card2}}><span style={{fontSize:11,color:G.muted,fontFamily:"monospace"}}>{t.date}</span><span style={{fontSize:13,fontWeight:500,color:G.text}}>{t.desc}</span><span><Pill label={t.category} color={CAT_COLOR[t.category]||G.muted}/></span><span style={{textAlign:"right",fontWeight:700,color:t.type==="income"?G.teal:G.red,fontSize:13,fontFamily:"monospace"}}>{t.type==="income"?"+":"-"}{fmt(t.amount)}</span><span style={{fontSize:11,color:G.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.note||""}</span><div style={{display:"flex",gap:4}}><button onClick={()=>openEdit(t)} style={{background:"none",border:"none",color:G.muted,cursor:"pointer",fontSize:13}}>✏️</button><button onClick={()=>del(t.id)} style={{background:"none",border:"none",color:G.muted,cursor:"pointer",fontSize:13}}>✕</button></div></div>)}</div>
        </Card>
      )}
      {modal&&<Modal title="Add Transaction" onClose={()=>setModal(false)}><div style={{display:"flex",flexDirection:"column",gap:12}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Field label="Type"><Sel value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="expense">Expense</option><option value="income">Income</option></Sel></Field><Field label="Date"><Inp type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></Field></div><div style={{display:"flex",gap:6,marginTop:-6}}><button onClick={()=>setForm({...form,date:today})} style={{background:form.date===today?`${G.teal}18`:"none",border:`1px solid ${form.date===today?G.teal:G.border}`,borderRadius:7,padding:"3px 10px",fontSize:11,cursor:"pointer",color:form.date===today?G.teal:G.muted,fontFamily:"inherit"}}>Today</button><button onClick={()=>setForm({...form,date:yesterday})} style={{background:form.date===yesterday?`${G.teal}18`:"none",border:`1px solid ${form.date===yesterday?G.teal:G.border}`,borderRadius:7,padding:"3px 10px",fontSize:11,cursor:"pointer",color:form.date===yesterday?G.teal:G.muted,fontFamily:"inherit"}}>Yesterday</button></div><Field label="Description"><Inp value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})} placeholder="What was this for?"/></Field><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Field label="Amount ($)"><Inp type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0.00"/></Field><Field label="Category"><Sel value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</Sel></Field></div><Field label="Note (optional)"><Inp value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="Any notes..."/></Field><div style={{display:"flex",gap:10,marginTop:6}}><Btn onClick={add} style={{flex:1}}>Add Transaction</Btn><Btn onClick={()=>setModal(false)} outline style={{flex:1}}>Cancel</Btn></div></div></Modal>}
      {editTxn&&<Modal title="Edit Transaction" onClose={()=>setEditTxn(null)}><div style={{display:"flex",flexDirection:"column",gap:12}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Field label="Type"><Sel value={editTxn.type} onChange={e=>setEditTxn({...editTxn,type:e.target.value})}><option value="expense">Expense</option><option value="income">Income</option></Sel></Field><Field label="Date"><Inp type="date" value={editTxn.date} onChange={e=>setEditTxn({...editTxn,date:e.target.value})}/></Field></div><Field label="Description"><Inp value={editTxn.desc} onChange={e=>setEditTxn({...editTxn,desc:e.target.value})}/></Field><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Field label="Amount ($)"><Inp type="number" value={editTxn.amount} onChange={e=>setEditTxn({...editTxn,amount:e.target.value})}/></Field><Field label="Category"><Sel value={editTxn.category} onChange={e=>setEditTxn({...editTxn,category:e.target.value})}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</Sel></Field></div><Field label="Note (optional)"><Inp value={editTxn.note||""} onChange={e=>setEditTxn({...editTxn,note:e.target.value})}/></Field><div style={{display:"flex",gap:10,marginTop:6}}><Btn onClick={saveEdit} style={{flex:1}}>Save Changes</Btn><Btn onClick={()=>setEditTxn(null)} outline style={{flex:1}}>Cancel</Btn></div></div></Modal>}
      {csvModal&&<Modal title="Import from CSV" wide onClose={()=>setCsvModal(false)}><div style={{display:"flex",flexDirection:"column",gap:14}}><div style={{background:G.card2,border:`2px dashed ${G.border}`,borderRadius:12,padding:24,textAlign:"center"}}><div style={{fontSize:32,marginBottom:8}}>📂</div><div style={{fontWeight:600,marginBottom:4,color:G.text}}>Select Bank CSV</div><div style={{color:G.muted,fontSize:12,marginBottom:14}}>Export CSV from your bank and upload here. Works with most banks.</div><Btn onClick={()=>fileRef.current.click()}>Choose File</Btn><input ref={fileRef} type="file" accept=".csv" onChange={handleCSV} style={{display:"none"}}/></div>{csvMsg&&<div style={{background:`${G.teal}12`,border:`1px solid ${G.teal}30`,borderRadius:10,padding:"10px 14px",fontSize:12,color:G.teal}}>{csvMsg}</div>}{csvData&&<><div style={{fontWeight:600,fontSize:13,color:G.text}}>Map Columns</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>{[["date","Date *"],["desc","Description *"],["amount","Amount *"],["type","Type (optional)"],["category","Category override (optional)"]].map(([k,lbl])=><Field key={k} label={lbl}><Sel value={mapping[k]} onChange={e=>setMapping({...mapping,[k]:e.target.value})}><option value="">-- Skip --</option>{cols.map(c=><option key={c} value={c}>{c}</option>)}</Sel></Field>)}</div>{mapping.desc&&<div style={{background:`${G.teal}10`,border:`1px solid ${G.teal}30`,borderRadius:10,padding:"10px 14px"}}><div style={{fontWeight:600,fontSize:12,color:G.teal,marginBottom:8}}>🤖 Auto-detected categories (preview)</div><div style={{display:"flex",flexDirection:"column",gap:5}}>{csvData.data.slice(0,5).map((row,i)=>{const desc=(row[mapping.desc]||"").trim();const cat=autoCategory(desc);return<div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,gap:8}}><span style={{color:G.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{desc||"—"}</span><Pill label={cat} color={CAT_COLOR[cat]||G.muted}/></div>;})}</div></div>}<div style={{display:"flex",gap:10}}><Btn onClick={importCSV} style={{flex:1}}>Import {csvData.data.length} Rows</Btn><Btn onClick={()=>setCsvModal(false)} outline style={{flex:1}}>Cancel</Btn></div></>}</div></Modal>}
    </div>
  );
}


/* ── RECURRING TRANSACTIONS ── */
function Recurring({transactions,setTransactions,recurring,setRecurring,showToast,fmt}){
  const G=useG();const[modal,setModal]=useState(false);
  const[form,setForm]=useState({desc:"",amount:"",type:"income",category:"Salary",dayOfMonth:"1"});
  const add=async()=>{if(!form.desc||!form.amount)return;const u=[...recurring,{id:uid(),...form,amount:parseFloat(form.amount),dayOfMonth:parseInt(form.dayOfMonth),active:true,lastRun:""}];setRecurring(u);await store.set("recurring",u);setModal(false);setForm({desc:"",amount:"",type:"income",category:"Salary",dayOfMonth:"1"});showToast("Recurring entry added");};
  const del=async id=>{if(!window.confirm("Remove this recurring entry?"))return;const u=recurring.filter(r=>r.id!==id);setRecurring(u);await store.set("recurring",u);showToast("Removed");};
  const toggle=async id=>{const u=recurring.map(r=>r.id===id?{...r,active:!r.active}:r);setRecurring(u);await store.set("recurring",u);};
  const runNow=async r=>{const t={id:uid(),date:todayStr(),desc:r.desc,amount:r.amount,type:r.type,category:r.category,note:"[Recurring]"};const u=[t,...transactions];setTransactions(u);await store.set("transactions",u);const ru=recurring.map(x=>x.id===r.id?{...x,lastRun:todayStr()}:x);setRecurring(ru);await store.set("recurring",ru);showToast(`Added: ${r.desc} — all tabs updated`);};
  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><h2 style={{fontSize:22,fontWeight:700,color:G.text,marginBottom:3}}>Recurring Transactions</h2><p style={{color:G.muted,fontSize:13}}>Auto-scheduled monthly entries</p></div><Btn small onClick={()=>setModal(true)}>+ Add</Btn></div>
      <div style={{background:`${G.teal}10`,border:`1px solid ${G.teal}30`,borderRadius:12,padding:"12px 16px",fontSize:12,color:G.muted}}>💡 Active entries run automatically on their scheduled day. Use "Run Now" to add immediately — all tabs update instantly.</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {recurring.map(r=><Card key={r.id} style={{padding:16}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}><div style={{width:10,height:10,borderRadius:"50%",background:r.active?G.green:G.muted,flexShrink:0}}/><div><div style={{fontWeight:600,fontSize:14,color:G.text}}>{r.desc}</div><div style={{fontSize:11,color:G.muted}}>Day {r.dayOfMonth} monthly · {r.category} · {r.lastRun?`Last: ${r.lastRun}`:"Never run"}</div></div></div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontFamily:"monospace",fontWeight:700,color:r.type==="income"?G.teal:G.red,fontSize:13}}>{r.type==="income"?"+":"-"}{fmt(r.amount)}</span>
            <Btn small outline onClick={()=>runNow(r)}>▶ Run Now</Btn>
            <button onClick={()=>toggle(r.id)} style={{background:"none",border:`1px solid ${G.border}`,borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:11,color:G.muted}}>{r.active?"Pause":"Resume"}</button>
            <button onClick={()=>del(r.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:G.muted}}>✕</button>
          </div>
        </div></Card>)}
        {!recurring.length&&<Card style={{textAlign:"center",padding:60}}><div style={{fontSize:44,marginBottom:10}}>🔁</div><div style={{fontWeight:600,color:G.text,marginBottom:4}}>No recurring entries</div><div style={{color:G.muted,fontSize:13}}>Add salary, rent, or other monthly transactions here</div></Card>}
      </div>
      {modal&&<Modal title="Add Recurring Transaction" onClose={()=>setModal(false)}><div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Field label="Type"><Sel value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="income">Income</option><option value="expense">Expense</option></Sel></Field><Field label="Day of Month (1-31)"><Inp type="number" min="1" max="31" value={form.dayOfMonth} onChange={e=>setForm({...form,dayOfMonth:e.target.value})}/></Field></div>
        <Field label="Description"><Inp value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})} placeholder="e.g. Monthly Salary"/></Field>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Field label="Amount"><Inp type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0.00"/></Field><Field label="Category"><Sel value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</Sel></Field></div>
        <div style={{display:"flex",gap:10,marginTop:6}}><Btn onClick={add} style={{flex:1}}>Add</Btn><Btn onClick={()=>setModal(false)} outline style={{flex:1}}>Cancel</Btn></div>
      </div></Modal>}
    </div>
  );
}

/* ── BUDGET ── */
function Budget({transactions,budgets,setBudgets,showToast,fmt}){
  const G=useG();const [editing,setEditing]=useState(null);const [newLimit,setNewLimit]=useState("");const [addModal,setAddModal]=useState(false);const [newCat,setNewCat]=useState({category:"",limit:""});
  const now=new Date();const tm=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const monthExp=transactions.filter(t=>t.type==="expense"&&t.date.startsWith(tm));
  const getSpent=cat=>monthExp.filter(t=>t.category===cat).reduce((a,b)=>a+b.amount,0);
  const save=async cat=>{const v=parseFloat(newLimit);if(isNaN(v)||v<=0)return;const u=budgets.map(b=>b.category===cat?{...b,limit:v}:b);setBudgets(u);await store.set("budgets",u);setEditing(null);setNewLimit("");showToast("Budget updated");};
  const addCat=async()=>{if(!newCat.category||!newCat.limit)return;if(budgets.find(b=>b.category===newCat.category)){showToast("Category already exists","error");return;}const u=[...budgets,{category:newCat.category,limit:parseFloat(newCat.limit),rollover:0}];setBudgets(u);await store.set("budgets",u);setAddModal(false);setNewCat({category:"",limit:""});showToast("Budget category added");};
  const delCat=async cat=>{if(!window.confirm(`Remove ${cat} budget?`))return;const u=budgets.filter(b=>b.category!==cat);setBudgets(u);await store.set("budgets",u);showToast("Category removed");};
  const total=budgets.reduce((a,b)=>a+(b.limit||0)+(b.rollover||0),0);const spent=budgets.reduce((a,b)=>a+getSpent(b.category),0);
  const unusedCats=CATEGORIES.filter(c=>!budgets.find(b=>b.category===c));
  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><h2 style={{fontSize:22,fontWeight:700,color:G.text,marginBottom:3}}>Monthly Budget</h2><p style={{color:G.muted,fontSize:13}}>{now.toLocaleString("default",{month:"long",year:"numeric"})}</p></div><div style={{display:"flex",gap:8,alignItems:"center"}}><div style={{fontFamily:"monospace",fontSize:16,fontWeight:700,color:spent>total?G.red:G.teal}}>{fmt(spent)}<span style={{color:G.muted,fontSize:12}}> / {fmt(total)}</span></div><Btn small outline onClick={async()=>{const pd=new Date();pd.setMonth(pd.getMonth()-1);const pm=`${pd.getFullYear()}-${String(pd.getMonth()+1).padStart(2,"0")}`;const u=budgets.map(b=>{const prev=transactions.filter(t=>t.type==="expense"&&t.date.startsWith(pm)&&t.category===b.category).reduce((a,x)=>a+x.amount,0);return{...b,rollover:parseFloat(Math.max(0,b.limit-prev).toFixed(2))};});setBudgets(u);await store.set("budgets",u);showToast("Unused budget rolled over!");}}>↩️ Rollover</Btn><Btn small onClick={()=>setAddModal(true)}>+ Add</Btn></div></div>
      <Card><div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{fontSize:13,fontWeight:500,color:G.text}}>Overall Health</span><span style={{fontFamily:"monospace",fontSize:13,color:spent>total?G.red:G.teal}}>{total>0?((spent/total)*100).toFixed(0):0}%</span></div><Bar value={spent} max={total} color={spent>total?G.red:G.teal} h={10}/><div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:11,color:G.muted}}><span>{fmt(spent)} spent</span><span>{fmt(Math.max(0,total-spent))} left</span></div></Card>
      {(() => {const txCats=[...new Set(transactions.filter(t=>t.type==="expense").map(t=>t.category))].filter(c=>!budgets.find(b=>b.category===c)&&c!=="Other");return txCats.length>0?(<div style={{background:`${G.gold}10`,border:`1px solid ${G.gold}30`,borderRadius:12,padding:"12px 16px",fontSize:12,color:G.muted}}>💡 <strong style={{color:G.gold}}>Tip:</strong> You have transactions in {txCats.map(c=><Pill key={c} label={c} color={CAT_COLOR[c]||G.muted}/>).reduce((a,b,i)=>[...a,i>0&&<span key={i}> </span>,b],[])} that don't have a budget yet. Click "+ Add" to track them.</div>):null;})()}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
        {budgets.map(b=>{const s=getSpent(b.category);const eff=(b.limit||0)+(b.rollover||0);const over=s>eff;const p=Math.min(100,(s/Math.max(eff,1))*100);const color=over?G.red:p>80?G.gold:CAT_COLOR[b.category]||G.teal;return <Card key={b.category}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{display:"flex",alignItems:"center",gap:7}}><div style={{width:9,height:9,borderRadius:"50%",background:CAT_COLOR[b.category]||G.teal}}/><span style={{fontWeight:600,fontSize:14,color:G.text}}>{b.category}</span></div><div style={{display:"flex",alignItems:"center",gap:6}}>{over&&<Pill label="Over" color={G.red}/>}<button onClick={()=>delCat(b.category)} style={{background:"none",border:"none",color:G.muted,cursor:"pointer",fontSize:12}}>✕</button></div></div><div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}><span style={{fontFamily:"monospace",fontSize:13,color:over?G.red:G.text}}>{fmt(s)}</span><span style={{fontFamily:"monospace",fontSize:11,color:G.muted}}>/ {fmt(eff)}{(b.rollover||0)>0&&<span style={{color:G.green,fontSize:10}}> +{fmt(b.rollover)}</span>}</span></div><Bar value={s} max={eff} color={color} h={7}/><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:9}}><span style={{fontSize:11,color:G.muted}}>{over?`${fmt(s-eff)} over`:`${fmt(eff-s)} left`}</span>{editing===b.category?<div style={{display:"flex",gap:5,alignItems:"center"}}><Inp type="number" value={newLimit} onChange={e=>setNewLimit(e.target.value)} style={{width:85,padding:"5px 8px",fontSize:12}}/><Btn small onClick={()=>save(b.category)}>Save</Btn><Btn small outline onClick={()=>setEditing(null)}>✕</Btn></div>:<Btn small outline onClick={()=>{setEditing(b.category);setNewLimit(b.limit);}}>Edit</Btn>}</div></Card>;})}
      </div>
      {addModal&&<Modal title="Add Budget Category" onClose={()=>setAddModal(false)}><div style={{display:"flex",flexDirection:"column",gap:12}}><Field label="Category"><Sel value={newCat.category} onChange={e=>setNewCat({...newCat,category:e.target.value})}><option value="">-- Select --</option>{unusedCats.map(c=><option key={c}>{c}</option>)}</Sel></Field><Field label="Monthly Limit ($)"><Inp type="number" value={newCat.limit} onChange={e=>setNewCat({...newCat,limit:e.target.value})} placeholder="500"/></Field><div style={{display:"flex",gap:10,marginTop:6}}><Btn onClick={addCat} style={{flex:1}}>Add</Btn><Btn onClick={()=>setAddModal(false)} outline style={{flex:1}}>Cancel</Btn></div></div></Modal>}
    </div>
  );
}

/* ── SUBSCRIPTIONS ── */
function Subscriptions({subscriptions,setSubscriptions,showToast,fmt}){
  const G=useG();const isMobile=useIsMobile();const [modal,setModal]=useState(false);const [editSub,setEditSub]=useState(null);const [form,setForm]=useState({name:"",amount:"",due:"1",category:"Entertainment"});const [alertMsg,setAlertMsg]=useState("");
  const total=subscriptions.reduce((a,b)=>a+b.amount,0);const today=new Date().getDate();
  const add=async()=>{if(!form.name||!form.amount)return;const u=[...subscriptions,{id:uid(),...form,amount:parseFloat(form.amount),due:parseInt(form.due)}];setSubscriptions(u);await store.set("subscriptions",u);setModal(false);setForm({name:"",amount:"",due:"1",category:"Entertainment"});showToast("Subscription added");};
  const del=async id=>{if(!window.confirm("Remove this subscription?"))return;const u=subscriptions.filter(s=>s.id!==id);setSubscriptions(u);await store.set("subscriptions",u);showToast("Removed");};
  const curMonth=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
  const isPaid=s=>(s.paidMonths||[]).includes(curMonth);
  const markPaid=async id=>{const u=subscriptions.map(s=>s.id===id?{...s,paidMonths:[...(s.paidMonths||[]).filter(m=>m!==curMonth),curMonth]}:s);setSubscriptions(u);await store.set("subscriptions",u);showToast("Marked as paid!");};
  const unmarkPaid=async id=>{const u=subscriptions.map(s=>s.id===id?{...s,paidMonths:(s.paidMonths||[]).filter(m=>m!==curMonth)}:s);setSubscriptions(u);await store.set("subscriptions",u);showToast("Unmarked");};
  const saveEdit=async()=>{if(!editSub.name||!editSub.amount)return;const u=subscriptions.map(s=>s.id===editSub.id?{...editSub,amount:parseFloat(editSub.amount),due:parseInt(editSub.due)}:s);setSubscriptions(u);await store.set("subscriptions",u);setEditSub(null);showToast("Subscription updated");};
  const badge=due=>{const d=due-today;if(d===0)return{label:"Due Today",color:G.red};if(d===1)return{label:"Tomorrow",color:G.gold};if(d<=3)return{label:`${d}d left`,color:G.gold};if(d<0)return{label:"Paid",color:G.green};return null;};
  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><h2 style={{fontSize:22,fontWeight:700,color:G.text,marginBottom:3}}>Subscriptions</h2><p style={{color:G.muted,fontSize:13}}>{subscriptions.length} recurring bills</p></div><div style={{display:"flex",gap:10}}><Btn outline onClick={async()=>{if(!("Notification"in window)){setAlertMsg("Notifications not supported.");return;}const p=await Notification.requestPermission();if(p!=="granted"){setAlertMsg("Permission denied.");return;}const t=new Date().getDate();const up=subscriptions.filter(s=>s.due-t>=0&&s.due-t<=3);if(!up.length){new Notification("FinTrack",{body:"No bills due in 3 days!"});setAlertMsg("All clear! No bills due soon.");}else{up.forEach(s=>{const d=s.due-t;new Notification("💸 Bill Due",{body:d===0?`${s.name} DUE TODAY (${fmt(s.amount)})`:`${s.name} due in ${d}d (${fmt(s.amount)})`});});setAlertMsg(`${up.length} alert(s) sent!`);}setTimeout(()=>setAlertMsg(""),4000);}}>🔔 Alerts</Btn><Btn onClick={()=>setModal(true)}>+ Add</Btn></div></div>
      {alertMsg&&<div style={{background:`${G.teal}12`,border:`1px solid ${G.teal}30`,borderRadius:10,padding:"10px 14px",fontSize:12,color:G.teal}}>🔔 {alertMsg}</div>}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:12}}><StatCard label="Monthly" value={fmt(total)} color={G.red} icon="🔄"/><StatCard label="Annual" value={fmt(total*12)} color={G.gold} icon="📅"/><StatCard label="Daily" value={fmt(total/30)} color={G.purple} icon="📊"/><StatCard label="Paid This Month" value={`${subscriptions.filter(isPaid).length}/${subscriptions.length}`} color={G.green} icon="✅"/></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>{subscriptions.map(s=>{const b=badge(s.due);return <Card key={s.id}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div style={{fontWeight:700,fontSize:16,marginBottom:6,color:G.text}}>{s.name}</div><Pill label={s.category} color={CAT_COLOR[s.category]||G.muted}/>{b&&<div style={{marginTop:6}}><Pill label={b.label} color={b.color}/></div>}<div style={{marginTop:10,color:G.muted,fontSize:11}}>Day {s.due} monthly</div></div><div style={{textAlign:"right"}}><div style={{fontFamily:"monospace",fontSize:20,fontWeight:700,color:G.red}}>{fmt(s.amount)}</div><div style={{fontSize:11,color:G.muted,marginBottom:10}}>/month</div><div style={{display:"flex",gap:6,justifyContent:"flex-end"}}><button onClick={()=>setEditSub({...s,amount:String(s.amount),due:String(s.due)})} style={{background:"none",border:`1px solid ${G.border}`,color:G.muted,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11}}>Edit</button><button onClick={()=>del(s.id)} style={{background:"none",border:`1px solid ${G.border}`,color:G.muted,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11}}>Remove</button>{isPaid(s)?<button onClick={()=>unmarkPaid(s.id)} style={{background:"none",border:`1px solid ${G.border}`,color:G.muted,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:10}}>Unpay</button>:<button onClick={()=>markPaid(s.id)} style={{background:`${G.green}15`,border:`1px solid ${G.green}40`,color:G.green,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:10,fontWeight:600}}>✓ Paid</button>}</div></div></div></Card>;})}
      {!subscriptions.length&&<Card style={{gridColumn:"1/-1",textAlign:"center",padding:60}}><div style={{fontSize:44,marginBottom:10}}>🔄</div><div style={{fontWeight:600,color:G.text,marginBottom:4}}>No subscriptions yet</div></Card>}</div>
      {modal&&<Modal title="Add Subscription" onClose={()=>setModal(false)}><div style={{display:"flex",flexDirection:"column",gap:12}}><Field label="Service Name"><Inp value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Netflix"/></Field><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Field label="Amount ($)"><Inp type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0.00"/></Field><Field label="Billing Day"><Inp type="number" min="1" max="31" value={form.due} onChange={e=>setForm({...form,due:e.target.value})}/></Field></div><Field label="Category"><Sel value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</Sel></Field><div style={{display:"flex",gap:10,marginTop:6}}><Btn onClick={add} style={{flex:1}}>Add</Btn><Btn onClick={()=>setModal(false)} outline style={{flex:1}}>Cancel</Btn></div></div></Modal>}
      {editSub&&<Modal title="Edit Subscription" onClose={()=>setEditSub(null)}><div style={{display:"flex",flexDirection:"column",gap:12}}><Field label="Service Name"><Inp value={editSub.name} onChange={e=>setEditSub({...editSub,name:e.target.value})}/></Field><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Field label="Amount ($)"><Inp type="number" value={editSub.amount} onChange={e=>setEditSub({...editSub,amount:e.target.value})}/></Field><Field label="Billing Day"><Inp type="number" min="1" max="31" value={editSub.due} onChange={e=>setEditSub({...editSub,due:e.target.value})}/></Field></div><Field label="Category"><Sel value={editSub.category} onChange={e=>setEditSub({...editSub,category:e.target.value})}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</Sel></Field><div style={{display:"flex",gap:10,marginTop:6}}><Btn onClick={saveEdit} style={{flex:1}}>Save Changes</Btn><Btn onClick={()=>setEditSub(null)} outline style={{flex:1}}>Cancel</Btn></div></div></Modal>}
    </div>
  );
}

/* ── GOALS ── */
function Goals({goals,setGoals,showToast,fmt}){
  const G=useG();const [modal,setModal]=useState(false);const [editGoal,setEditGoal]=useState(null);const [dep,setDep]=useState({id:null,amount:""});const [form,setForm]=useState({name:"",target:"",saved:"0",icon:"🎯"});
  const ICONS=["🎯","✈️","🏠","💻","🚗","💍","🎓","🛡️","📱","🏋️","🌴","💰"];const COLS=[G.teal,G.gold,G.purple,G.red,"#EA580C","#0284C7","#16A34A"];
  const add=async()=>{if(!form.name||!form.target)return;const u=[...goals,{id:uid(),...form,target:parseFloat(form.target),saved:parseFloat(form.saved||0)}];setGoals(u);await store.set("goals",u);setModal(false);setForm({name:"",target:"",saved:"0",icon:"🎯"});showToast("Goal created");};
  const addDep=async()=>{const v=parseFloat(dep.amount);if(isNaN(v)||v<=0)return;const u=goals.map(g=>g.id===dep.id?{...g,saved:Math.min(g.target,parseFloat((g.saved+v).toFixed(2)))}:g);setGoals(u);await store.set("goals",u);setDep({id:null,amount:""});showToast("Deposit added");};
  const del=async id=>{if(!window.confirm("Delete this goal?"))return;const u=goals.filter(g=>g.id!==id);setGoals(u);await store.set("goals",u);showToast("Goal deleted");};
  const saveEdit=async()=>{if(!editGoal.name||!editGoal.target)return;const u=goals.map(g=>g.id===editGoal.id?{...editGoal,target:parseFloat(editGoal.target),saved:parseFloat(editGoal.saved||0)}:g);setGoals(u);await store.set("goals",u);setEditGoal(null);showToast("Goal updated");};
  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><h2 style={{fontSize:22,fontWeight:700,color:G.text,marginBottom:3}}>Savings Goals</h2><p style={{color:G.muted,fontSize:13}}>{goals.length} active goals</p></div><Btn onClick={()=>setModal(true)}>+ New Goal</Btn></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
        {goals.map((g,i)=>{const pct=Math.min(100,(g.saved/g.target)*100);const color=COLS[i%COLS.length];const done=pct>=100;return <Card key={g.id}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}><div style={{display:"flex",alignItems:"center",gap:9}}><div style={{fontSize:26}}>{g.icon}</div><div><div style={{fontWeight:700,fontSize:14,color:G.text}}>{g.name}</div>{done&&<Pill label="Goal Reached!" color={G.green}/>}</div></div><div style={{display:"flex",gap:4}}><button onClick={()=>setEditGoal({...g,target:String(g.target),saved:String(g.saved)})} style={{background:"none",border:"none",color:G.muted,cursor:"pointer",fontSize:13}}>✏️</button><button onClick={()=>del(g.id)} style={{background:"none",border:"none",color:G.muted,cursor:"pointer",fontSize:16}}>✕</button></div></div><div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontFamily:"monospace",fontSize:16,fontWeight:700,color}}>{fmt(g.saved)}</span><span style={{fontFamily:"monospace",fontSize:12,color:G.muted}}>of {fmt(g.target)}</span></div><Bar value={g.saved} max={g.target} color={color} h={9}/><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}><span style={{fontSize:11,color:G.muted}}>{pct.toFixed(0)}% · {fmt(g.target-g.saved)} left</span>{!done&&(dep.id===g.id?<div style={{display:"flex",gap:5,alignItems:"center"}}><Inp type="number" value={dep.amount} onChange={e=>setDep({...dep,amount:e.target.value})} style={{width:80,padding:"5px 8px",fontSize:12}}/><Btn small onClick={addDep}>Add</Btn><Btn small outline onClick={()=>setDep({id:null,amount:""})}>✕</Btn></div>:<Btn small onClick={()=>setDep({id:g.id,amount:""})}>+ Deposit</Btn>)}</div></Card>;})}
        {!goals.length&&<Card style={{gridColumn:"1/-1",textAlign:"center",padding:60}}><div style={{fontSize:44,marginBottom:10}}>🏆</div><div style={{fontWeight:600,color:G.text,marginBottom:4}}>No goals yet</div></Card>}
      </div>
      {modal&&<Modal title="Create Goal" onClose={()=>setModal(false)}><div style={{display:"flex",flexDirection:"column",gap:12}}><Field label="Icon"><div style={{display:"flex",flexWrap:"wrap",gap:7}}>{ICONS.map(ic=><button key={ic} onClick={()=>setForm({...form,icon:ic})} style={{width:38,height:38,borderRadius:7,border:`2px solid ${form.icon===ic?G.teal:G.border}`,background:"none",fontSize:18,cursor:"pointer"}}>{ic}</button>)}</div></Field><Field label="Goal Name"><Inp value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Emergency Fund"/></Field><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Field label="Target ($)"><Inp type="number" value={form.target} onChange={e=>setForm({...form,target:e.target.value})} placeholder="5000"/></Field><Field label="Already Saved ($)"><Inp type="number" value={form.saved} onChange={e=>setForm({...form,saved:e.target.value})} placeholder="0"/></Field></div><div style={{display:"flex",gap:10,marginTop:6}}><Btn onClick={add} style={{flex:1}}>Create Goal</Btn><Btn onClick={()=>setModal(false)} outline style={{flex:1}}>Cancel</Btn></div></div></Modal>}
      {editGoal&&<Modal title="Edit Goal" onClose={()=>setEditGoal(null)}><div style={{display:"flex",flexDirection:"column",gap:12}}><Field label="Icon"><div style={{display:"flex",flexWrap:"wrap",gap:7}}>{ICONS.map(ic=><button key={ic} onClick={()=>setEditGoal({...editGoal,icon:ic})} style={{width:38,height:38,borderRadius:7,border:`2px solid ${editGoal.icon===ic?G.teal:G.border}`,background:"none",fontSize:18,cursor:"pointer"}}>{ic}</button>)}</div></Field><Field label="Goal Name"><Inp value={editGoal.name} onChange={e=>setEditGoal({...editGoal,name:e.target.value})}/></Field><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Field label="Target ($)"><Inp type="number" value={editGoal.target} onChange={e=>setEditGoal({...editGoal,target:e.target.value})}/></Field><Field label="Saved So Far ($)"><Inp type="number" value={editGoal.saved} onChange={e=>setEditGoal({...editGoal,saved:e.target.value})}/></Field></div><div style={{display:"flex",gap:10,marginTop:6}}><Btn onClick={saveEdit} style={{flex:1}}>Save Changes</Btn><Btn onClick={()=>setEditGoal(null)} outline style={{flex:1}}>Cancel</Btn></div></div></Modal>}
    </div>
  );
}

/* ── NET WORTH ── */
function NetWorth({assets,setAssets,liabilities,setLiabilities,netWorthHistory,setNetWorthHistory,showToast,fmt}){
  const G=useG();const isMobile=useIsMobile();const [aModal,setAModal]=useState(false);const [lModal,setLModal]=useState(false);const [aForm,setAForm]=useState({name:"",value:"",type:"cash"});const [lForm,setLForm]=useState({name:"",value:"",type:"credit"});
  const [editItem,setEditItem]=useState(null);
  const tA=assets.reduce((a,b)=>a+b.value,0);const tL=liabilities.reduce((a,b)=>a+b.value,0);const nw=tA-tL;
  const ATYPES=["cash","investment","property","vehicle","other"];const LTYPES=["mortgage","auto","credit","student","medical","other"];
  const ACOL={cash:G.teal,investment:G.purple,property:G.gold,vehicle:"#EA580C",other:G.muted};const LCOL={mortgage:G.red,auto:"#EA580C",credit:"#DB2777",student:G.gold,medical:"#0284C7",other:G.muted};
  const snap=async(a,l)=>{const tA=a.reduce((x,b)=>x+b.value,0);const tL=l.reduce((x,b)=>x+b.value,0);const s={date:new Date().toISOString().slice(0,10),netWorth:parseFloat((tA-tL).toFixed(2)),assets:parseFloat(tA.toFixed(2)),liabilities:parseFloat(tL.toFixed(2))};const ex=await store.get("netWorthHistory")||[];const u=[...ex.filter(h=>h.date!==s.date),s].sort((a,b)=>a.date.localeCompare(b.date)).slice(-24);setNetWorthHistory(u);await store.set("netWorthHistory",u);
    const newNW=parseFloat((tA-tL).toFixed(2));const hit=NW_MILESTONES.filter(m=>prevNW<m&&newNW>=m);if(hit.length)setMilestone(hit[hit.length-1]);
  };
  const addA=async()=>{if(!aForm.name||!aForm.value)return;const u=[...assets,{id:uid(),...aForm,value:parseFloat(aForm.value)}];setAssets(u);await store.set("assets",u);await snap(u,liabilities);setAModal(false);setAForm({name:"",value:"",type:"cash"});showToast("Asset added");};
  const addL=async()=>{if(!lForm.name||!lForm.value)return;const u=[...liabilities,{id:uid(),...lForm,value:parseFloat(lForm.value)}];setLiabilities(u);await store.set("liabilities",u);await snap(assets,u);setLModal(false);setLForm({name:"",value:"",type:"credit"});showToast("Liability added");};
  const delA=async id=>{if(!window.confirm("Delete this asset?"))return;const u=assets.filter(a=>a.id!==id);setAssets(u);await store.set("assets",u);await snap(u,liabilities);showToast("Asset deleted");};
  const delL=async id=>{if(!window.confirm("Delete this liability?"))return;const u=liabilities.filter(l=>l.id!==id);setLiabilities(u);await store.set("liabilities",u);await snap(assets,u);showToast("Liability deleted");};
  const saveEditItem=async()=>{const v=parseFloat(editItem.item.value);if(!editItem.item.name||isNaN(v))return;if(editItem.kind==="asset"){const u=assets.map(a=>a.id===editItem.item.id?{...editItem.item,value:v}:a);setAssets(u);await store.set("assets",u);await snap(u,liabilities);}else{const u=liabilities.map(l=>l.id===editItem.item.id?{...editItem.item,value:v}:l);setLiabilities(u);await store.set("liabilities",u);await snap(assets,u);}setEditItem(null);showToast("Updated");};
  const aPie=ATYPES.map(t=>({name:t,value:assets.filter(a=>a.type===t).reduce((x,b)=>x+b.value,0)})).filter(d=>d.value>0);
  const lPie=LTYPES.map(t=>({name:t,value:liabilities.filter(l=>l.type===t).reduce((x,b)=>x+b.value,0)})).filter(d=>d.value>0);
  const[milestone,setMilestone]=useState(null);
  const prevNW=netWorthHistory.length>=2?netWorthHistory[netWorthHistory.length-2].netWorth:0;
  const nextMs=NW_MILESTONES.find(m=>m>(tA-tL));
  return(
    <>
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div><h2 style={{fontSize:22,fontWeight:700,color:G.text,marginBottom:3}}>Net Worth</h2><p style={{color:G.muted,fontSize:13}}>Assets minus liabilities</p></div>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:12}}><StatCard label="Total Assets" value={fmt(tA)} color={G.teal} icon="📈"/><StatCard label="Total Liabilities" value={fmt(tL)} color={G.red} icon="📉"/><StatCard label="Net Worth" value={fmt(nw)} color={nw>=0?G.teal:G.red} icon="💎"/></div>
      {nextMs&&<div style={{background:`${G.purple}12`,border:`1px solid ${G.purple}30`,borderRadius:12,padding:"12px 16px",display:"flex",gap:12,alignItems:"center"}}><span style={{fontSize:20}}>🎯</span><div style={{flex:1}}><div style={{fontWeight:600,fontSize:13,color:G.purple}}>Next Milestone: {fmt(nextMs)}</div><div style={{fontSize:12,color:G.muted,marginBottom:6}}>{fmt(nextMs-(tA-tL))} to go · {(((tA-tL)/nextMs)*100).toFixed(0)}% there</div><Bar value={tA-tL} max={nextMs} color={G.purple} h={5}/></div></div>}
      {netWorthHistory.length>1&&<Card><div style={{fontWeight:600,marginBottom:14,fontSize:13,color:G.text}}>History</div><ResponsiveContainer width="100%" height={170}><AreaChart data={netWorthHistory}><defs><linearGradient id="gnw2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={G.purple} stopOpacity={.25}/><stop offset="95%" stopColor={G.purple} stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke={G.border}/><XAxis dataKey="date" tick={{fill:G.muted,fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:G.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`$${(v/1000).toFixed(0)}k`}/><Tooltip content={<TT/>}/><Area type="monotone" dataKey="netWorth" name="Net Worth" stroke={G.purple} fill="url(#gnw2)" strokeWidth={2}/><Area type="monotone" dataKey="assets" name="Assets" stroke={G.teal} fill="none" strokeWidth={1.5} strokeDasharray="4 4"/><Area type="monotone" dataKey="liabilities" name="Liabilities" stroke={G.red} fill="none" strokeWidth={1.5} strokeDasharray="4 4"/></AreaChart></ResponsiveContainer></Card>}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
        {[[" Assets",assets,aPie,ACOL,aModal,setAModal,addA,aForm,setAForm,delA,ATYPES,G.teal,"cash"],[" Liabilities",liabilities,lPie,LCOL,lModal,setLModal,addL,lForm,setLForm,delL,LTYPES,G.red,"credit"]].map(([title,items,pie,cols,isOpen,setOpen,onAdd,frm,setFrm,onDel,types,hc])=>(
          <div key={title} style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontWeight:700,fontSize:15,color:hc}}>{title}</div><Btn small color={hc} onClick={()=>setOpen(true)}>+ Add</Btn></div>
            {items.length>0&&<ResponsiveContainer width="100%" height={110}><PieChart><Pie data={pie} cx="50%" cy="50%" outerRadius={52} dataKey="value">{pie.map((e,i)=><Cell key={i} fill={cols[e.name]||G.muted}/>)}</Pie><Tooltip formatter={v=>fmt(v)} contentStyle={{background:G.card,border:`1px solid ${G.border}`,borderRadius:8,fontSize:11}}/></PieChart></ResponsiveContainer>}
            <div style={{display:"flex",flexDirection:"column",gap:6}}>{items.map(item=><div key={item.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",background:G.card2,borderRadius:9,border:`1px solid ${G.border}`}}><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:8,height:8,borderRadius:"50%",background:cols[item.type]||G.muted}}/><div><div style={{fontSize:12,fontWeight:500,color:G.text}}>{item.name}</div><div style={{fontSize:10,color:G.muted,textTransform:"capitalize"}}>{item.type}</div></div></div><div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontFamily:"monospace",fontWeight:700,color:hc,fontSize:13}}>{fmt(item.value)}</span><button onClick={()=>setEditItem({item:{...item,value:String(item.value)},kind:title.trim()==="Assets"?"asset":"liability"})} style={{background:"none",border:"none",color:G.muted,cursor:"pointer",fontSize:12}}>✏️</button><button onClick={()=>onDel(item.id)} style={{background:"none",border:"none",color:G.muted,cursor:"pointer",fontSize:13}}>✕</button></div></div>)}{!items.length&&<div style={{textAlign:"center",padding:24,color:G.muted,fontSize:12}}>None yet</div>}</div>
            {isOpen&&<Modal title={`Add${title}`} onClose={()=>setOpen(false)}><div style={{display:"flex",flexDirection:"column",gap:12}}><Field label="Name"><Inp value={frm.name} onChange={e=>setFrm({...frm,name:e.target.value})} placeholder="e.g. Checking Account"/></Field><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Field label="Value ($)"><Inp type="number" value={frm.value} onChange={e=>setFrm({...frm,value:e.target.value})}/></Field><Field label="Type"><Sel value={frm.type} onChange={e=>setFrm({...frm,type:e.target.value})}>{types.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}</Sel></Field></div><div style={{display:"flex",gap:10,marginTop:6}}><Btn onClick={onAdd} color={hc} style={{flex:1}}>Add</Btn><Btn onClick={()=>setOpen(false)} outline style={{flex:1}}>Cancel</Btn></div></div></Modal>}
          </div>
        ))}
      </div>
    </div>
    {milestone&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1200}} onClick={()=>setMilestone(null)}><div style={{background:G.card,borderRadius:24,padding:40,textAlign:"center",maxWidth:340,border:`2px solid ${G.gold}`}}><div style={{fontSize:60,marginBottom:12}}>🎉</div><div style={{fontSize:24,fontWeight:800,color:G.gold,marginBottom:8}}>Milestone Reached!</div><div style={{fontSize:18,fontWeight:700,color:G.text,marginBottom:8}}>{fmt(milestone)} Net Worth</div><div style={{color:G.muted,fontSize:13,marginBottom:20}}>Congratulations on reaching this financial milestone! Keep building!</div><Btn onClick={()=>setMilestone(null)}>🙌 Let's go!</Btn></div></div>}
    {editItem&&<Modal title={`Edit ${editItem.kind==="asset"?"Asset":"Liability"}`} onClose={()=>setEditItem(null)}><div style={{display:"flex",flexDirection:"column",gap:12}}><Field label="Name"><Inp value={editItem.item.name} onChange={e=>setEditItem({...editItem,item:{...editItem.item,name:e.target.value}})}/></Field><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Field label="Value ($)"><Inp type="number" value={editItem.item.value} onChange={e=>setEditItem({...editItem,item:{...editItem.item,value:e.target.value}})}/></Field><Field label="Type"><Sel value={editItem.item.type} onChange={e=>setEditItem({...editItem,item:{...editItem.item,type:e.target.value}})}>{(editItem.kind==="asset"?ATYPES:LTYPES).map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}</Sel></Field></div><div style={{display:"flex",gap:10,marginTop:6}}><Btn onClick={saveEditItem} style={{flex:1}}>Save Changes</Btn><Btn onClick={()=>setEditItem(null)} outline style={{flex:1}}>Cancel</Btn></div></div></Modal>}
    </>
  );
}

/* ── CREDIT CARDS ── */
function CreditCards({cards,setCards,showToast,fmt}){
  const G=useG();const [modal,setModal]=useState(false);const [editCard,setEditCard]=useState(null);const [payModal,setPayModal]=useState(null);const [calcModal,setCalcModal]=useState(false);
  const [form,setForm]=useState({name:"",last4:"",limit:"",balance:"",apr:"",minPayment:"",dueDay:"15",ca:"#1a1a2e",cb:"#16213e"});const [payAmt,setPayAmt]=useState("");const [extra,setExtra]=useState("100");const [method,setMethod]=useState("avalanche");
  const isMobile=useIsMobile();
  const today=new Date().getDate();const totalDebt=cards.reduce((a,b)=>a+b.balance,0);const totalLimit=cards.reduce((a,b)=>a+b.limit,0);const util=totalLimit>0?((totalDebt/totalLimit)*100).toFixed(1):0;const uc=util>50?G.red:util>30?G.gold:G.green;
  const addCard=async()=>{if(!form.name||!form.limit||!form.apr)return;const u=[...cards,{id:uid(),...form,limit:parseFloat(form.limit),balance:parseFloat(form.balance||0),apr:parseFloat(form.apr),minPayment:parseFloat(form.minPayment||25),dueDay:parseInt(form.dueDay),payments:[]}];setCards(u);await store.set("cards",u);setModal(false);setForm({name:"",last4:"",limit:"",balance:"",apr:"",minPayment:"",dueDay:"15",ca:"#1a1a2e",cb:"#16213e"});showToast("Card added");};
  const delCard=async id=>{if(!window.confirm("Delete this card?"))return;const u=cards.filter(c=>c.id!==id);setCards(u);await store.set("cards",u);showToast("Card deleted");};
  const saveEditCard=async()=>{if(!editCard.name||!editCard.limit||!editCard.apr)return;const u=cards.map(c=>c.id===editCard.id?{...editCard,limit:parseFloat(editCard.limit),balance:parseFloat(editCard.balance||0),apr:parseFloat(editCard.apr),minPayment:parseFloat(editCard.minPayment||25),dueDay:parseInt(editCard.dueDay)}:c);setCards(u);await store.set("cards",u);setEditCard(null);showToast("Card updated");};
  const makePay=async()=>{const amt=parseFloat(payAmt);if(isNaN(amt)||amt<=0){showToast("Enter a valid amount","error");return;}const u=cards.map(c=>c.id===payModal.id?{...c,balance:Math.max(0,parseFloat((c.balance-amt).toFixed(2))),payments:[{id:uid(),amount:amt,date:new Date().toISOString().slice(0,10)},...(c.payments||[])]}:c);setCards(u);await store.set("cards",u);setPayModal(null);setPayAmt("");showToast(`Payment of ${fmt(amt)} recorded`);};
  const av=calcPayoff(cards,parseFloat(extra)||0,"avalanche");const sn=calcPayoff(cards,parseFloat(extra)||0,"snowball");const mn=calcPayoff(cards,0,"avalanche");
  const dueBadge=day=>{const d=day-today;if(d===0)return{label:"Due Today",color:G.red};if(d===1)return{label:"Tomorrow",color:G.gold};if(d<=3)return{label:`${d}d left`,color:G.gold};return null;};
  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><h2 style={{fontSize:22,fontWeight:700,color:G.text,marginBottom:3}}>Credit Cards</h2><p style={{color:G.muted,fontSize:13}}>{cards.length} cards · {fmt(totalDebt)} total debt</p></div><div style={{display:"flex",gap:10}}><Btn outline onClick={()=>setCalcModal(true)}>📊 Payoff Calc</Btn><Btn onClick={()=>setModal(true)}>+ Add Card</Btn></div></div>
      {/* Credit Health */}
      <Card><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}><div><div style={{fontWeight:700,fontSize:15,color:G.text,marginBottom:4}}>Credit Utilization</div><div style={{fontSize:12,color:G.muted}}>Keep below 30% for a healthy score</div></div><div style={{textAlign:"right"}}><div style={{fontFamily:"monospace",fontSize:28,fontWeight:800,color:uc}}>{util}%</div><Pill label={util>50?"High Risk":util>30?"Watch Out":"Healthy"} color={uc}/></div></div><Bar value={totalDebt} max={totalLimit} color={uc} h={12}/><div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:11,color:G.muted}}><span>{fmt(totalDebt)} used</span><span>{fmt(totalLimit-totalDebt)} available · {fmt(totalLimit)} limit</span></div></Card>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:12}}><StatCard label="Total Debt" value={fmt(totalDebt)} color={G.red} icon="💳"/><StatCard label="Available Credit" value={fmt(totalLimit-totalDebt)} color={G.green} icon="✅"/><StatCard label="Min Payments/mo" value={fmt(cards.reduce((a,b)=>a+b.minPayment,0))} color={G.gold} icon="📅"/></div>
      {/* Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:16}}>
        {cards.map(card=>{const avail=card.limit-card.balance;const p=Math.min(100,(card.balance/card.limit)*100);const uc2=p>50?G.red:p>30?G.gold:G.green;const b=dueBadge(card.dueDay);return <div key={card.id} style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:`linear-gradient(135deg,${card.ca},${card.cb})`,borderRadius:16,padding:"20px 22px",color:"#fff",position:"relative",overflow:"hidden",minHeight:140}}>
            <div style={{position:"absolute",top:-20,right:-20,width:120,height:120,borderRadius:"50%",background:"rgba(255,255,255,.06)"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}><div style={{fontWeight:700,fontSize:15}}>{card.name}</div><div style={{display:"flex",gap:6}}><button onClick={()=>setEditCard({...card,limit:String(card.limit),balance:String(card.balance),apr:String(card.apr),minPayment:String(card.minPayment),dueDay:String(card.dueDay)})} style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:11}}>✏️ Edit</button><button onClick={()=>delCard(card.id)} style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:11}}>✕</button></div></div>
            <div style={{fontFamily:"monospace",fontSize:15,letterSpacing:2,opacity:.8,marginBottom:12}}>•••• •••• •••• {card.last4||"****"}</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}><div><div style={{fontSize:10,opacity:.6,marginBottom:2}}>BALANCE</div><div style={{fontFamily:"monospace",fontSize:20,fontWeight:700}}>{fmt(card.balance)}</div></div><div style={{textAlign:"right"}}><div style={{fontSize:10,opacity:.6,marginBottom:2}}>APR</div><div style={{fontFamily:"monospace",fontSize:16,fontWeight:600}}>{card.apr}%</div></div></div>
          </div>
          <Card style={{padding:16}}>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr",gap:8,marginBottom:10}}>
              {[["UTILIZATION",`${p.toFixed(0)}%`,uc2],["AVAILABLE",fmt(avail),G.green],["MIN PAYMENT",fmt(card.minPayment),G.gold]].map(([lbl,val,col])=><div key={lbl}><div style={{fontSize:9,color:G.muted,fontWeight:700,letterSpacing:.5,marginBottom:2}}>{lbl}</div><div style={{fontFamily:"monospace",fontWeight:700,color:col,fontSize:13}}>{val}</div></div>)}
            </div>
            <Bar value={card.balance} max={card.limit} color={uc2} h={6}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10}}><div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:11,color:G.muted}}>Due Day {card.dueDay}</span>{b&&<Pill label={b.label} color={b.color}/>}</div><Btn small onClick={()=>{setPayModal(card);setPayAmt("");}}>💳 Pay</Btn></div>
            {(card.payments||[]).length>0&&<div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${G.border}`}}><div style={{fontSize:9,color:G.muted,fontWeight:700,letterSpacing:.5,marginBottom:6}}>RECENT PAYMENTS</div>{(card.payments||[]).slice(0,2).map(p=><div key={p.id} style={{display:"flex",justifyContent:"space-between",fontSize:11}}><span style={{color:G.muted}}>{p.date}</span><span style={{color:G.green,fontFamily:"monospace",fontWeight:600}}>-{fmt(p.amount)}</span></div>)}</div>}
          </Card>
        </div>;})}
        {!cards.length&&<Card style={{gridColumn:"1/-1",textAlign:"center",padding:60}}><div style={{fontSize:44,marginBottom:10}}>💳</div><div style={{fontWeight:600,color:G.text,marginBottom:4}}>No cards added</div><div style={{color:G.muted,fontSize:13}}>Track your credit cards, utilization, and payoff timeline</div></Card>}
      </div>
      {/* PAYMENT MODAL */}
      {payModal&&<Modal title={`Pay ${payModal.name}`} onClose={()=>setPayModal(null)}><div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{background:G.card2,borderRadius:12,padding:16,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div><div style={{fontSize:10,color:G.muted,fontWeight:700,letterSpacing:.5}}>CURRENT BALANCE</div><div style={{fontFamily:"monospace",fontSize:18,fontWeight:700,color:G.red}}>{fmt(payModal.balance)}</div></div><div><div style={{fontSize:10,color:G.muted,fontWeight:700,letterSpacing:.5}}>MIN PAYMENT</div><div style={{fontFamily:"monospace",fontSize:18,fontWeight:700,color:G.gold}}>{fmt(payModal.minPayment)}</div></div></div>
        <Field label="Payment Amount ($)"><Inp type="number" value={payAmt} onChange={e=>setPayAmt(e.target.value)} placeholder={`Min: ${fmt(payModal.minPayment)}`}/></Field>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>{[payModal.minPayment,payModal.balance/2,payModal.balance].map(amt=><button key={amt} onClick={()=>setPayAmt(amt.toFixed(2))} style={{background:parseFloat(payAmt)===parseFloat(amt.toFixed(2))?`${G.teal}15`:G.card2,border:`1px solid ${parseFloat(payAmt)===parseFloat(amt.toFixed(2))?G.teal:G.border}`,borderRadius:9,padding:"8px 14px",cursor:"pointer",textAlign:"left",display:"flex",justifyContent:"space-between",color:G.text,fontFamily:"inherit",fontSize:12}}><span>{amt===payModal.minPayment?"Minimum":amt===payModal.balance/2?"Half Balance":"Full Balance"}</span><span style={{fontFamily:"monospace",fontWeight:600}}>{fmt(amt)}</span></button>)}</div>
        <div style={{display:"flex",gap:10}}><Btn onClick={makePay} style={{flex:1}}>Confirm Payment</Btn><Btn onClick={()=>setPayModal(null)} outline style={{flex:1}}>Cancel</Btn></div>
      </div></Modal>}
      {/* PAYOFF CALC */}
      {calcModal&&<Modal title="Payoff Calculator" wide onClose={()=>setCalcModal(false)}><div style={{display:"flex",flexDirection:"column",gap:16}}>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:10}}><Field label="Extra Monthly Payment ($)"><Inp type="number" value={extra} onChange={e=>setExtra(e.target.value)} placeholder="100"/></Field><Field label="Strategy"><Sel value={method} onChange={e=>setMethod(e.target.value)}><option value="avalanche">Avalanche (Highest APR First)</option><option value="snowball">Snowball (Lowest Balance First)</option></Sel></Field></div>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)",gap:10}}>{[{label:"Min Payments Only",r:mn,color:G.red},{label:"Avalanche Method",r:av,color:G.teal},{label:"Snowball Method",r:sn,color:G.purple}].map(({label,r,color})=><div key={label} style={{background:G.card2,border:`1px solid ${G.border}`,borderRadius:12,padding:14}}><div style={{fontSize:10,color:G.muted,fontWeight:700,letterSpacing:.5,marginBottom:8}}>{label.toUpperCase()}</div><div style={{fontFamily:"monospace",fontSize:18,fontWeight:700,color,marginBottom:4}}>{r.months?fmtM(r.months):"Paid off!"}</div><div style={{fontSize:11,color:G.muted}}>Interest: {fmt(r.interest)}</div></div>)}</div>
        {av.schedule.length>0&&<><div style={{fontWeight:600,fontSize:13,color:G.text}}>Balance Paydown Chart</div>
          <ResponsiveContainer width="100%" height={170}><AreaChart data={av.schedule.filter((_,i)=>i%Math.max(1,Math.floor(av.schedule.length/20))===0)}><defs><linearGradient id="gpay" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={G.teal} stopOpacity={.25}/><stop offset="95%" stopColor={G.teal} stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke={G.border}/><XAxis dataKey="month" tick={{fill:G.muted,fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:G.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`$${(v/1000).toFixed(0)}k`}/><Tooltip content={<TT/>}/><Area type="monotone" dataKey="balance" name="Balance" stroke={G.teal} fill="url(#gpay)" strokeWidth={2}/></AreaChart></ResponsiveContainer>
          {mn.months>0&&<div style={{background:`${G.green}12`,border:`1px solid ${G.green}30`,borderRadius:10,padding:"12px 14px",fontSize:12,color:G.text}}>💡 Adding {fmt(parseFloat(extra)||0)}/mo saves <strong style={{color:G.green}}>{fmt(mn.interest-av.interest)}</strong> in interest and pays off debt <strong style={{color:G.green}}>{fmtM(mn.months-av.months)}</strong> sooner.</div>}
        </>}
      </div></Modal>}
      {/* ADD CARD */}
      {modal&&<Modal title="Add Credit Card" wide onClose={()=>setModal(false)}><div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Field label="Card Name"><Inp value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Chase Sapphire"/></Field><Field label="Last 4 Digits"><Inp value={form.last4} onChange={e=>setForm({...form,last4:e.target.value.slice(0,4)})} placeholder="4321" maxLength={4}/></Field></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Field label="Credit Limit ($)"><Inp type="number" value={form.limit} onChange={e=>setForm({...form,limit:e.target.value})} placeholder="5000"/></Field><Field label="Current Balance ($)"><Inp type="number" value={form.balance} onChange={e=>setForm({...form,balance:e.target.value})} placeholder="0.00"/></Field></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}><Field label="APR (%)"><Inp type="number" value={form.apr} onChange={e=>setForm({...form,apr:e.target.value})} placeholder="22.99"/></Field><Field label="Min Payment ($)"><Inp type="number" value={form.minPayment} onChange={e=>setForm({...form,minPayment:e.target.value})} placeholder="25"/></Field><Field label="Due Day"><Inp type="number" min="1" max="31" value={form.dueDay} onChange={e=>setForm({...form,dueDay:e.target.value})}/></Field></div>
        <Field label="Card Color"><div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:4}}>{CARD_GRADS.map(g=><button key={g.a} onClick={()=>setForm({...form,ca:g.a,cb:g.b})} style={{width:40,height:26,borderRadius:7,background:`linear-gradient(135deg,${g.a},${g.b})`,border:`2px solid ${form.ca===g.a?"#666":"#ccc"}`,cursor:"pointer",boxShadow:form.ca===g.a?"0 0 0 2px "+G.teal:"none"}}/>)}</div></Field>
        <div style={{display:"flex",gap:10,marginTop:6}}><Btn onClick={addCard} style={{flex:1}}>Add Card</Btn><Btn onClick={()=>setModal(false)} outline style={{flex:1}}>Cancel</Btn></div>
      </div></Modal>}
      {/* EDIT CARD */}
      {editCard&&<Modal title="Edit Credit Card" wide onClose={()=>setEditCard(null)}><div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Field label="Card Name"><Inp value={editCard.name} onChange={e=>setEditCard({...editCard,name:e.target.value})}/></Field><Field label="Last 4 Digits"><Inp value={editCard.last4} onChange={e=>setEditCard({...editCard,last4:e.target.value.slice(0,4)})} maxLength={4}/></Field></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Field label="Credit Limit ($)"><Inp type="number" value={editCard.limit} onChange={e=>setEditCard({...editCard,limit:e.target.value})}/></Field><Field label="Current Balance ($)"><Inp type="number" value={editCard.balance} onChange={e=>setEditCard({...editCard,balance:e.target.value})}/></Field></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}><Field label="APR (%)"><Inp type="number" value={editCard.apr} onChange={e=>setEditCard({...editCard,apr:e.target.value})}/></Field><Field label="Min Payment ($)"><Inp type="number" value={editCard.minPayment} onChange={e=>setEditCard({...editCard,minPayment:e.target.value})}/></Field><Field label="Due Day"><Inp type="number" min="1" max="31" value={editCard.dueDay} onChange={e=>setEditCard({...editCard,dueDay:e.target.value})}/></Field></div>
        <Field label="Card Color"><div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:4}}>{CARD_GRADS.map(g=><button key={g.a} onClick={()=>setEditCard({...editCard,ca:g.a,cb:g.b})} style={{width:40,height:26,borderRadius:7,background:`linear-gradient(135deg,${g.a},${g.b})`,border:`2px solid ${editCard.ca===g.a?"#666":"#ccc"}`,cursor:"pointer",boxShadow:editCard.ca===g.a?"0 0 0 2px "+G.teal:"none"}}/>)}</div></Field>
        <div style={{display:"flex",gap:10,marginTop:6}}><Btn onClick={saveEditCard} style={{flex:1}}>Save Changes</Btn><Btn onClick={()=>setEditCard(null)} outline style={{flex:1}}>Cancel</Btn></div>
      </div></Modal>}
    </div>
  );
}

/* ── SETTINGS ── */
function Settings({onClose,isDark,setIsDark,allData,onLock,onClearData,currency,setCurrencyPref,onImport,showToast}){
  const G=useG();const [msg,setMsg]=useState("");const [msgType,setMsgType]=useState("ok");const fileRef=useRef();
  
  const say=(m,t=3500,type="ok")=>{setMsg(m);setMsgType(type);setTimeout(()=>setMsg(""),t);};
  const handleImport=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=async ev=>{try{const d=JSON.parse(ev.target.result);await onImport(d);say("✅ All data imported and updated instantly!");if(showToast)showToast("Backup imported — all tabs updated");}catch{say("❌ Invalid backup file.","3500","err");}};r.readAsText(f);};
  // PIN auth removed — password managed via Supabase Auth in UserProfile
  return(
    <>
    <Modal title="⚙️ Settings" onClose={onClose}><div style={{display:"flex",flexDirection:"column",gap:20}}>
      {msg&&<div style={{background:msgType==="err"?`${G.red}12`:`${G.teal}12`,border:`1px solid ${msgType==="err"?G.red:G.teal}30`,borderRadius:10,padding:"10px 14px",fontSize:12,color:msgType==="err"?G.red:G.teal}}>{msg}</div>}
      <div><div style={{fontWeight:600,fontSize:13,color:G.text,marginBottom:12}}>Appearance</div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:G.card2,borderRadius:10,border:`1px solid ${G.border}`}}><div><div style={{fontWeight:500,fontSize:13,color:G.text}}>{isDark?"🌙 Dark Mode":"☀️ Light Mode"}</div><div style={{fontSize:11,color:G.muted}}>Toggle app theme</div></div><button onClick={()=>setIsDark(d=>!d)} style={{width:44,height:24,borderRadius:99,background:isDark?G.teal:G.border,border:"none",cursor:"pointer",position:"relative",transition:"background .2s"}}><div style={{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:isDark?22:3,transition:"left .2s"}}/></button></div></div>
      <div><div style={{fontWeight:600,fontSize:13,color:G.text,marginBottom:12}}>Data & Backup</div><div style={{display:"flex",flexDirection:"column",gap:8}}><Btn outline onClick={()=>doExportJSON(allData)} style={{width:"100%"}}>📥 Export JSON Backup</Btn><Btn outline onClick={()=>fileRef.current.click()} style={{width:"100%"}}>📤 Import JSON Backup</Btn><input ref={fileRef} type="file" accept=".json" onChange={handleImport} style={{display:"none"}}/><Btn outline onClick={()=>doPDF(allData.transactions||[],allData.subscriptions||[],allData.goals||[])} style={{width:"100%"}}>📄 Export PDF Report</Btn></div></div>
      <div><div style={{fontWeight:600,fontSize:13,color:G.text,marginBottom:12}}>Currency</div><select value={currency||"USD"} onChange={e=>setCurrencyPref(e.target.value)} style={{background:G.card2,border:`1px solid ${G.border}`,color:G.text,borderRadius:9,padding:"9px 12px",fontFamily:"inherit",fontSize:13,outline:"none",width:"100%"}}>{CURRENCIES.map(c=><option key={c.code} value={c.code}>{c.symbol} {c.name} ({c.code})</option>)}</select></div><div><div style={{fontWeight:600,fontSize:13,color:G.text,marginBottom:12}}>Security</div><div style={{display:"flex",flexDirection:"column",gap:8}}><Btn outline onClick={onLock} style={{width:"100%"}}>🔒 Lock App Now</Btn></div></div>
      <div><div style={{fontWeight:600,fontSize:13,color:G.text,marginBottom:4}}>About</div><div style={{background:G.card2,border:`1px solid ${G.border}`,borderRadius:10,padding:"12px 14px",fontSize:12,color:G.muted}}>💼 <strong style={{color:G.text}}>FinTrack Pro</strong> — Personal Finance Tracker. Your data is stored securely in your personal Supabase database. No ads. No tracking.</div></div>
      <div style={{borderTop:`1px solid ${G.border}`,paddingTop:16}}><div style={{fontWeight:600,fontSize:13,color:G.red,marginBottom:8}}>Danger Zone</div><Btn color={G.red} outline onClick={onClearData} style={{width:"100%"}}>🗑️ Clear All Data</Btn></div>
    </div></Modal>
    
    </>
  );
}


/* ── REPORTS TAB ── */
function Reports({transactions,budgets,fmt}){
  const G=useG();const isMobile=useIsMobile();
  const now=new Date();
  const[monthsBack,setMonthsBack]=useState(12);
  const[viewCat,setViewCat]=useState("all");

  // Build monthly data for the last N months
  const monthData=Array.from({length:monthsBack},(_,i)=>{
    const d=new Date(now.getFullYear(),now.getMonth()-monthsBack+1+i,1);
    const k=monthKey(d);
    const mt=transactions.filter(t=>t.date.startsWith(k));
    const inc=mt.filter(t=>t.type==="income").reduce((a,b)=>a+b.amount,0);
    const exp=mt.filter(t=>t.type==="expense").reduce((a,b)=>a+b.amount,0);
    const savings=inc>0?((inc-exp)/inc*100):0;
    return{month:d.toLocaleString("default",{month:"short",year:"2-digit"}),income:inc,expenses:exp,net:inc-exp,savings:parseFloat(savings.toFixed(1)),key:k};
  });

  // All-time category breakdown
  const expTxns=transactions.filter(t=>t.type==="expense");
  const catTotals={};expTxns.forEach(t=>{catTotals[t.category]=(catTotals[t.category]||0)+t.amount;});
  const catData=Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value:parseFloat(value.toFixed(2))}));

  // Filtered transactions for drill-down
  const filtered=viewCat==="all"?transactions:transactions.filter(t=>t.category===viewCat);
  const filteredExp=filtered.filter(t=>t.type==="expense");

  // Savings rate over time
  const avgSavings=monthData.filter(m=>m.income>0).reduce((a,b)=>a+b.savings,0)/Math.max(1,monthData.filter(m=>m.income>0).length);
  const totalInc=monthData.reduce((a,b)=>a+b.income,0);
  const totalExp=monthData.reduce((a,b)=>a+b.expenses,0);
  const bestMonth=monthData.reduce((a,b)=>b.net>a.net?b:a,monthData[0]||{net:0,month:""});
  const worstMonth=monthData.reduce((a,b)=>b.expenses>a.expenses?b:a,monthData[0]||{expenses:0,month:""});

  // CSV export
  const exportCSV=()=>{
    const rows=[["Date","Description","Category","Type","Amount"],...transactions.sort((a,b)=>b.date.localeCompare(a.date)).map(t=>[t.date,t.desc,t.category,t.type,t.amount])];
    const csv=rows.map(r=>r.map(v=>`"${v}"`).join(",")).join("\n");
    const b=new Blob([csv],{type:"text/csv"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`fintrack-export-${todayStr()}.csv`;a.click();URL.revokeObjectURL(u);
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
        <div><h2 style={{fontSize:22,fontWeight:700,color:G.text,marginBottom:3}}>📊 Financial Reports</h2><p style={{color:G.muted,fontSize:13}}>Historical analysis across all your data</p></div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <Sel value={monthsBack} onChange={e=>setMonthsBack(parseInt(e.target.value))} style={{width:140}}>
            <option value={3}>Last 3 months</option><option value={6}>Last 6 months</option><option value={12}>Last 12 months</option><option value={24}>Last 24 months</option>
          </Sel>
          <Btn small outline onClick={exportCSV}>📥 Export CSV</Btn>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:12}}>
        <StatCard label="Total Income" value={fmt(totalInc)} color={G.teal} icon="💰" sub={`${monthsBack} months`}/>
        <StatCard label="Total Spent" value={fmt(totalExp)} color={G.red} icon="📤" sub={`${monthsBack} months`}/>
        <StatCard label="Avg Savings Rate" value={`${avgSavings.toFixed(1)}%`} color={avgSavings>=20?G.green:avgSavings>=10?G.gold:G.red} icon="🎯"/>
        <StatCard label="Best Month" value={bestMonth.month||"—"} color={G.purple} sub={bestMonth.net?`+${fmt(bestMonth.net)} net`:""} icon="🏆"/>
      </div>

      {/* Income vs Expenses chart */}
      <Card>
        <div style={{fontWeight:600,marginBottom:14,fontSize:13,color:G.text}}>Income vs Expenses — Monthly</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthData} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke={G.border}/>
            <XAxis dataKey="month" tick={{fill:G.muted,fontSize:10}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:G.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>fmt(v)}/>
            <Tooltip content={<TT fmt={fmt}/>}/>
            <RBar dataKey="income" name="Income" fill={G.teal} radius={[3,3,0,0]} fillOpacity={.85}/>
            <RBar dataKey="expenses" name="Expenses" fill={G.red} radius={[3,3,0,0]} fillOpacity={.85}/>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Savings rate line */}
      <Card>
        <div style={{fontWeight:600,marginBottom:14,fontSize:13,color:G.text}}>Savings Rate % by Month</div>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={monthData.filter(m=>m.income>0)}>
            <defs><linearGradient id="gsr" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={G.green} stopOpacity={.3}/><stop offset="95%" stopColor={G.green} stopOpacity={0}/></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke={G.border}/>
            <XAxis dataKey="month" tick={{fill:G.muted,fontSize:10}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:G.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`${v}%`}/>
            <Tooltip formatter={v=>`${v}%`} contentStyle={{background:G.card,border:`1px solid ${G.border}`,borderRadius:8,fontSize:12}}/>
            <Area type="monotone" dataKey="savings" name="Savings Rate" stroke={G.green} fill="url(#gsr)" strokeWidth={2}/>
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Category breakdown */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
        <Card>
          <div style={{fontWeight:600,marginBottom:14,fontSize:13,color:G.text}}>All-Time Spending by Category</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart><Pie data={catData.slice(0,8)} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={10}>
              {catData.slice(0,8).map((e,i)=><Cell key={i} fill={CAT_COLOR[e.name]||G.muted}/>)}
            </Pie><Tooltip formatter={v=>fmt(v)} contentStyle={{background:G.card,border:`1px solid ${G.border}`,borderRadius:8,fontSize:12}}/></PieChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <div style={{fontWeight:600,marginBottom:12,fontSize:13,color:G.text}}>Top Spending Categories</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {catData.slice(0,8).map((c,i)=><div key={c.name}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <button onClick={()=>setViewCat(viewCat===c.name?"all":c.name)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:0}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:CAT_COLOR[c.name]||G.muted}}/>
                  <span style={{fontSize:12,color:viewCat===c.name?G.teal:G.text,fontWeight:viewCat===c.name?700:400}}>{c.name}</span>
                </button>
                <span style={{fontSize:12,fontFamily:"monospace",color:G.muted}}>{fmt(c.value)}</span>
              </div>
              <Bar value={c.value} max={catData[0].value} color={CAT_COLOR[c.name]||G.muted} h={4}/>
            </div>)}
          </div>
          {viewCat!=="all"&&<div style={{marginTop:10,fontSize:11,color:G.teal}}>Filtering by {viewCat} — <button onClick={()=>setViewCat("all")} style={{background:"none",border:"none",color:G.teal,cursor:"pointer",fontSize:11,fontWeight:600}}>Clear</button></div>}
        </Card>
      </div>

      {/* Monthly table */}
      <Card style={{padding:0,overflow:"hidden"}}>
        <div style={{padding:"14px 18px",borderBottom:`1px solid ${G.border}`,fontWeight:600,fontSize:13,color:G.text}}>Month-by-Month Summary</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:G.card2}}>
              {["Month","Income","Expenses","Net","Savings Rate"].map(h=><th key={h} style={{padding:"9px 14px",textAlign:"left",color:G.muted,fontWeight:700,fontSize:10,letterSpacing:.6,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}
            </tr></thead>
            <tbody>{[...monthData].reverse().map((m,i)=><tr key={m.key} style={{borderBottom:`1px solid ${G.border}22`,background:i%2===0?"transparent":G.card2}}>
              <td style={{padding:"9px 14px",color:G.text,fontWeight:500}}>{m.month}</td>
              <td style={{padding:"9px 14px",color:G.teal,fontFamily:"monospace",fontWeight:600}}>{fmt(m.income)}</td>
              <td style={{padding:"9px 14px",color:G.red,fontFamily:"monospace",fontWeight:600}}>{fmt(m.expenses)}</td>
              <td style={{padding:"9px 14px",color:m.net>=0?G.teal:G.red,fontFamily:"monospace",fontWeight:700}}>{m.net>=0?"+":""}{fmt(m.net)}</td>
              <td style={{padding:"9px 14px"}}><span style={{color:m.savings>=20?G.green:m.savings>=10?G.gold:G.red,fontWeight:600}}>{m.income>0?`${m.savings}%`:"—"}</span></td>
            </tr>)}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ── SEARCH TAB ── */
function GlobalSearch({transactions,subscriptions,goals,cards,budgets,fmt,setTab}){
  const G=useG();const isMobile=useIsMobile();const[q,setQ]=useState("");const iRef=useRef();
  useEffect(()=>{setTimeout(()=>iRef.current?.focus(),100);},[]);
  if(!q.trim())return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div><h2 style={{fontSize:22,fontWeight:700,color:G.text,marginBottom:3}}>🔍 Global Search</h2><p style={{color:G.muted,fontSize:13}}>Search across transactions, subscriptions, goals, and cards</p></div>
      <Inp ref={iRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search everything… e.g. 'netflix', 'rent', 'gym'" style={{fontSize:15,padding:"12px 16px"}}/>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(4,1fr)",gap:12}} >
        <StatCard label="Transactions" value={transactions.length} icon="💳" color={G.teal}/>
        <StatCard label="Subscriptions" value={subscriptions.length} icon="🔄" color={G.purple}/>
        <StatCard label="Goals" value={goals.length} icon="🏆" color={G.gold}/>
        <StatCard label="Cards" value={cards.length} icon="💳" color={G.red}/>
      </div>
    </div>
  );
  const ql=q.toLowerCase();
  const txnR=transactions.filter(t=>t.desc.toLowerCase().includes(ql)||t.category.toLowerCase().includes(ql)||t.date.includes(ql)||(t.note||"").toLowerCase().includes(ql)).slice(0,20);
  const subR=subscriptions.filter(s=>s.name.toLowerCase().includes(ql)||s.category.toLowerCase().includes(ql)).slice(0,5);
  const goalR=goals.filter(g=>g.name.toLowerCase().includes(ql)).slice(0,5);
  const cardR=cards.filter(c=>c.name.toLowerCase().includes(ql)).slice(0,3);
  const total=txnR.length+subR.length+goalR.length+cardR.length;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div><h2 style={{fontSize:22,fontWeight:700,color:G.text,marginBottom:3}}>🔍 Global Search</h2></div>
      <Inp ref={iRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search everything…" style={{fontSize:15,padding:"12px 16px"}}/>
      <div style={{fontSize:12,color:G.muted}}>{total} result{total!==1?"s":""} for "<strong style={{color:G.text}}>{q}</strong>"</div>
      {txnR.length>0&&<div><div style={{fontWeight:600,fontSize:13,color:G.text,marginBottom:8}}>Transactions ({txnR.length})</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {txnR.map(t=><div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:G.card,border:`1px solid ${G.border}`,borderRadius:10}}>
            <div style={{display:"flex",alignItems:"center",gap:9}}><div style={{width:7,height:7,borderRadius:"50%",background:t.type==="income"?G.teal:G.red,flexShrink:0}}/><div><div style={{fontSize:13,fontWeight:500,color:G.text}}>{t.desc}</div><div style={{fontSize:11,color:G.muted}}>{t.date} · <Pill label={t.category} color={CAT_COLOR[t.category]||G.muted}/></div></div></div>
            <span style={{fontWeight:700,color:t.type==="income"?G.teal:G.red,fontFamily:"monospace",flexShrink:0}}>{t.type==="income"?"+":"-"}{fmt(t.amount)}</span>
          </div>)}
        </div>
      </div>}
      {subR.length>0&&<div><div style={{fontWeight:600,fontSize:13,color:G.text,marginBottom:8}}>Subscriptions ({subR.length})</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>{subR.map(s=><div key={s.id} style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",background:G.card,border:`1px solid ${G.border}`,borderRadius:10}}><span style={{fontSize:13,color:G.text}}>{s.name} · Day {s.due}</span><span style={{fontFamily:"monospace",color:G.red,fontWeight:600}}>{fmt(s.amount)}/mo</span></div>)}</div>
      </div>}
      {goalR.length>0&&<div><div style={{fontWeight:600,fontSize:13,color:G.text,marginBottom:8}}>Goals ({goalR.length})</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>{goalR.map(g=><div key={g.id} style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",background:G.card,border:`1px solid ${G.border}`,borderRadius:10}}><span style={{fontSize:13,color:G.text}}>{g.icon} {g.name}</span><span style={{fontFamily:"monospace",color:G.gold,fontWeight:600}}>{fmt(g.saved)} / {fmt(g.target)}</span></div>)}</div>
      </div>}
      {total===0&&<Card style={{textAlign:"center",padding:48}}><div style={{fontSize:40,marginBottom:10}}>🔍</div><div style={{color:G.muted,fontSize:14}}>No results found for "{q}"</div></Card>}
    </div>
  );
}

/* ── AUDIT LOG / SESSION LOG ── */
function AuditLog({auditLog}){
  const G=useG();
  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div><h2 style={{fontSize:22,fontWeight:700,color:G.text,marginBottom:3}}>🔐 Session Audit Log</h2><p style={{color:G.muted,fontSize:13}}>Recent app access and activity events</p></div>
      <div style={{background:`${G.teal}10`,border:`1px solid ${G.teal}30`,borderRadius:12,padding:"12px 16px",fontSize:12,color:G.muted}}>🔒 Your data is stored in your private Supabase database. This log tracks local session events only — no cloud logging of your financial data.</div>
      <Card style={{padding:0,overflow:"hidden"}}>
        <div style={{padding:"12px 18px",borderBottom:`1px solid ${G.border}`,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",color:G.muted,fontSize:10,fontWeight:700,letterSpacing:.8,textTransform:"uppercase"}}>
          <span>Time</span><span>Event</span><span>Detail</span>
        </div>
        <div style={{maxHeight:400,overflowY:"auto"}}>
          {auditLog.length===0&&<div style={{textAlign:"center",padding:40,color:G.muted,fontSize:13}}>No events yet this session</div>}
          {auditLog.map((e,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",padding:"10px 18px",borderBottom:`1px solid ${G.border}22`,alignItems:"center",background:i%2===0?"transparent":G.card2}}>
            <span style={{fontSize:11,color:G.muted,fontFamily:"monospace"}}>{e.time}</span>
            <span style={{fontSize:12,color:G.text,display:"flex",alignItems:"center",gap:6}}><span>{e.icon}</span>{e.event}</span>
            <span style={{fontSize:11,color:G.muted}}>{e.detail}</span>
          </div>)}
        </div>
      </Card>
    </div>
  );
}

/* ── SPENDING ALERTS COMPONENT ── */
function SpendingAlerts({transactions,budgets,subscriptions,fmt}){
  const G=useG();const now=new Date();const tm=monthKey();
  const alerts=[];
  // Budget alerts
  budgets.forEach(b=>{
    const spent=transactions.filter(t=>t.type==="expense"&&t.date.startsWith(tm)&&t.category===b.category).reduce((a,x)=>a+x.amount,0);
    const eff=(b.limit||0)+(b.rollover||0);const pct=eff>0?(spent/eff*100):0;
    if(pct>=100)alerts.push({type:"over",icon:"🔴",label:`${b.category} OVER budget`,detail:`Spent ${fmt(spent)} of ${fmt(eff)} limit`,color:G.red});
    else if(pct>=80)alerts.push({type:"warn",icon:"🟡",label:`${b.category} at ${pct.toFixed(0)}%`,detail:`${fmt(eff-spent)} remaining`,color:G.gold});
  });
  // Bill alerts
  const today=now.getDate();
  subscriptions.filter(s=>s.due-today>=0&&s.due-today<=3).forEach(s=>{
    const d=s.due-today;alerts.push({type:"bill",icon:"💳",label:`${s.name} due ${d===0?"TODAY":`in ${d}d`}`,detail:fmt(s.amount),color:d===0?G.red:G.gold});
  });
  // Savings rate alert
  const mt=transactions.filter(t=>t.date.startsWith(tm));
  const inc=mt.filter(t=>t.type==="income").reduce((a,b)=>a+b.amount,0);
  const exp=mt.filter(t=>t.type==="expense").reduce((a,b)=>a+b.amount,0);
  if(inc>0){const rate=(inc-exp)/inc*100;if(rate<10)alerts.push({type:"savings",icon:"⚠️",label:"Low savings rate",detail:`Only ${rate.toFixed(1)}% saved this month`,color:G.red});}
  // Unusual spending
  const prevM=new Date(now.getFullYear(),now.getMonth()-1,1);const pm=monthKey(prevM);
  budgets.forEach(b=>{
    const cur=transactions.filter(t=>t.type==="expense"&&t.date.startsWith(tm)&&t.category===b.category).reduce((a,x)=>a+x.amount,0);
    const prev=transactions.filter(t=>t.type==="expense"&&t.date.startsWith(pm)&&t.category===b.category).reduce((a,x)=>a+x.amount,0);
    if(prev>0&&cur>prev*1.5&&cur-prev>50)alerts.push({type:"spike",icon:"📈",label:`${b.category} spending spike`,detail:`+${fmt(cur-prev)} vs last month`,color:G.purple});
  });
  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div><h2 style={{fontSize:22,fontWeight:700,color:G.text,marginBottom:3}}>🚨 Spending Alerts</h2><p style={{color:G.muted,fontSize:13}}>{alerts.length} active alert{alerts.length!==1?"s":""}</p></div>
      {alerts.length===0&&<Card style={{textAlign:"center",padding:48}}><div style={{fontSize:48,marginBottom:12}}>✅</div><div style={{fontWeight:700,fontSize:16,color:G.green,marginBottom:6}}>All Clear!</div><div style={{color:G.muted,fontSize:13}}>No budget overruns, no upcoming bills, healthy savings rate.</div></Card>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {alerts.map((a,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 18px",background:G.card,border:`1px solid ${a.color}30`,borderLeft:`4px solid ${a.color}`,borderRadius:12,boxShadow:G.shadow}}>
          <span style={{fontSize:22,flexShrink:0}}>{a.icon}</span>
          <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13,color:G.text}}>{a.label}</div><div style={{fontSize:12,color:G.muted}}>{a.detail}</div></div>
          <Pill label={a.type==="over"?"Over Budget":a.type==="warn"?"Warning":a.type==="bill"?"Bill Due":a.type==="savings"?"Low Savings":"Spike"} color={a.color}/>
        </div>)}
      </div>
    </div>
  );
}

/* ── IMPORT TAB ── */
function ImportTab({transactions,setTransactions,budgets,setBudgets,showToast,fmt,addAudit}){
  const G=useG();const isMobile=useIsMobile();const fileRef=useRef();
  const[step,setStep]=useState("upload");// upload → map → preview → done
  const[csvData,setCsvData]=useState(null);
  const[cols,setCols]=useState([]);
  const[mapping,setMapping]=useState({date:"",desc:"",amount:"",type:"",category:""});
  const[preview,setPreview]=useState([]);
  const[importing,setImporting]=useState(false);
  const[stats,setStats]=useState(null);

  const reset=()=>{setStep("upload");setCsvData(null);setCols([]);setMapping({date:"",desc:"",amount:"",type:"",category:""});setPreview([]);setStats(null);if(fileRef.current)fileRef.current.value="";};

  const handleFile=e=>{
    const f=e.target.files[0];if(!f)return;
    Papa.parse(f,{header:true,skipEmptyLines:true,complete:r=>{
      const c=r.meta.fields||[];const g=ks=>c.find(x=>ks.some(k=>x.toLowerCase().includes(k)))||"";
      setCsvData(r.data);setCols(c);
      setMapping({date:g(["date","time","posted","trans"]),desc:g(["desc","name","merchant","memo","payee","narr"]),amount:g(["amount","debit","credit","sum","value","amt"]),type:g(["type","credit","debit","dr","cr"]),category:g(["category","cat","class"])});
      setStep("map");
    },error:()=>showToast("Failed to parse CSV — try a different file","error")});
  };

  const buildPreview=()=>{
    if(!mapping.date||!mapping.desc||!mapping.amount){showToast("Map Date, Description and Amount first","error");return;}
    const rows=csvData.map(row=>{
      const raw=parseFloat((row[mapping.amount]||"0").replace(/[^0-9.\-]/g,""));
      if(isNaN(raw)||raw===0)return null;
      const typeVal=(mapping.type&&row[mapping.type])||"";
      const isInc=raw>0||typeVal.toLowerCase().match(/credit|cr|deposit|incoming/);
      const desc=(row[mapping.desc]||"").trim()||"Imported";
      const manualCat=mapping.category&&row[mapping.category]?.trim();
      const category=CATEGORIES.includes(manualCat)?manualCat:autoCategory(desc);
      const rawDate=(row[mapping.date]||"").trim();
      // Try to parse various date formats
      let date=rawDate.slice(0,10);
      if(!date.match(/^\d{4}-\d{2}-\d{2}$/)){
        const d=new Date(rawDate);date=isNaN(d)?todayStr():d.toISOString().slice(0,10);
      }
      return{id:uid(),date,desc,amount:Math.abs(raw),type:isInc?"income":"expense",category,note:""};
    }).filter(Boolean);
    setPreview(rows);
    // compute stats
    const inc=rows.filter(r=>r.type==="income").reduce((a,b)=>a+b.amount,0);
    const exp=rows.filter(r=>r.type==="expense").reduce((a,b)=>a+b.amount,0);
    const byCat={};rows.forEach(r=>{if(r.type==="expense")byCat[r.category]=(byCat[r.category]||0)+r.amount;});
    setStats({total:rows.length,income:inc,expense:exp,byCat});
    setStep("preview");
  };

  const doImport=async()=>{
    setImporting(true);
    const merged=[...preview,...transactions];
    setTransactions(merged);
    await store.set("transactions",merged);
    // Auto-update budget categories based on imported spending
    const spendCats=[...new Set(preview.filter(r=>r.type==="expense").map(r=>r.category))];
    const missingCats=spendCats.filter(c=>!budgets.find(b=>b.category===c));
    if(missingCats.length){
      const newBudgets=[...budgets,...missingCats.map(c=>({category:c,limit:500,rollover:0}))];
      setBudgets(newBudgets);await store.set("budgets",newBudgets);
    }
    setStats(s=>({...s,imported:true}));setImporting(false);setStep("done");
    showToast(`${preview.length} transactions imported — all tabs updated!`);if(addAudit)addAudit('CSV Import',`${preview.length} transactions imported`,'📥');
  };

  const catSummary=stats?.byCat?Object.entries(stats.byCat).sort((a,b)=>b[1]-a[1]).slice(0,8):[];

  return(
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <div><h2 style={{fontSize:22,fontWeight:700,color:G.text,marginBottom:3}}>📥 Import Bank Transactions</h2>
        <p style={{color:G.muted,fontSize:13}}>Upload your bank CSV — all tabs (Dashboard, Budget, Calendar, etc.) update instantly after import.</p>
      </div>

      {/* Step indicator */}
      <div style={{display:"flex",alignItems:"center",gap:0}}>
        {[["upload","1. Upload"],["map","2. Map Columns"],["preview","3. Preview"],["done","4. Done"]].map(([s,lbl],i,arr)=>{
          const active=step===s;const past=["upload","map","preview","done"].indexOf(step)>i;
          return <div key={s} style={{display:"flex",alignItems:"center",flex:1}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,flex:1}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:past||active?G.teal:G.border,color:past||active?"#fff":G.muted,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,transition:"all .3s"}}>{past?"✓":i+1}</div>
              <span style={{fontSize:9,color:active?G.teal:past?G.teal:G.muted,fontWeight:active?700:400,whiteSpace:"nowrap"}}>{lbl}</span>
            </div>
            {i<arr.length-1&&<div style={{height:2,flex:1,background:past?G.teal:G.border,marginBottom:16,transition:"all .3s"}}/>}
          </div>;
        })}
      </div>

      {/* STEP 1: Upload */}
      {step==="upload"&&<Card style={{padding:40,textAlign:"center"}}>
        <div style={{fontSize:52,marginBottom:16}}>🏦</div>
        <div style={{fontWeight:700,fontSize:18,color:G.text,marginBottom:8}}>Upload Your Bank Statement</div>
        <div style={{color:G.muted,fontSize:13,marginBottom:24,maxWidth:400,margin:"0 auto 24px"}}>Export a CSV from your bank's website (Chase, Bank of America, Wells Fargo, etc.) and upload it here. Works with any bank CSV format.</div>
        <Btn onClick={()=>fileRef.current.click()} style={{fontSize:14,padding:"12px 28px"}}>📂 Choose CSV File</Btn>
        <input ref={fileRef} type="file" accept=".csv,.CSV" onChange={handleFile} style={{display:"none"}}/>
        <div style={{marginTop:20,display:"flex",justifyContent:"center",gap:20,flexWrap:"wrap"}}>
          {["Chase","Bank of America","Wells Fargo","Capital One","Citi","Any Bank"].map(b=><span key={b} style={{fontSize:11,color:G.muted,background:G.card2,borderRadius:6,padding:"3px 8px",border:`1px solid ${G.border}`}}>{b}</span>)}
        </div>
      </Card>}

      {/* STEP 2: Map Columns */}
      {step==="map"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
        <Card>
          <div style={{fontWeight:700,fontSize:15,color:G.text,marginBottom:4}}>Map Your CSV Columns</div>
          <div style={{fontSize:12,color:G.muted,marginBottom:16}}>We auto-detected the best matches below. Adjust if needed.</div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:12}}>
            {[["date","📅 Date *","Required"],["desc","📝 Description *","Required"],["amount","💰 Amount *","Required"],["type","↕️ Type","Optional – credit/debit"],["category","🏷️ Category","Optional – we auto-detect"]].map(([k,lbl,hint])=>
              <Field key={k} label={lbl}><Sel value={mapping[k]} onChange={e=>setMapping({...mapping,[k]:e.target.value})}>
                <option value="">-- Skip --</option>
                {cols.map(c=><option key={c} value={c}>{c}</option>)}
              </Sel><div style={{fontSize:10,color:G.muted,marginTop:3}}>{hint}</div></Field>
            )}
          </div>
        </Card>
        {/* Live preview of first 3 rows */}
        {mapping.desc&&csvData?.slice(0,3).length>0&&<Card>
          <div style={{fontWeight:600,fontSize:13,color:G.text,marginBottom:10}}>🤖 Auto-detected categories (first 3 rows)</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {csvData.slice(0,3).map((row,i)=>{
              const desc=(row[mapping.desc]||"").trim();const cat=autoCategory(desc);
              const raw=parseFloat((row[mapping.amount]||"0").replace(/[^0-9.\-]/g,""));
              return<div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:G.card2,borderRadius:8,gap:8}}>
                <span style={{fontSize:12,color:G.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{desc||"—"}</span>
                <Pill label={cat} color={CAT_COLOR[cat]||G.muted}/>
                <span style={{fontFamily:"monospace",fontSize:12,color:G.muted,flexShrink:0}}>{isNaN(raw)?"?":fmt(Math.abs(raw))}</span>
              </div>;
            })}
          </div>
        </Card>}
        <div style={{display:"flex",gap:10}}>
          <Btn outline onClick={reset} style={{flex:1}}>← Back</Btn>
          <Btn onClick={buildPreview} style={{flex:2}} disabled={!mapping.date||!mapping.desc||!mapping.amount}>Preview Import →</Btn>
        </div>
      </div>}

      {/* STEP 3: Preview */}
      {step==="preview"&&stats&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:12}}>
          <StatCard label="Total Rows" value={stats.total} color={G.teal} icon="📋"/>
          <StatCard label="Income" value={fmt(stats.income)} color={G.teal} icon="💰"/>
          <StatCard label="Expenses" value={fmt(stats.expense)} color={G.red} icon="📤"/>
          <StatCard label="Net" value={fmt(stats.income-stats.expense)} color={(stats.income-stats.expense)>=0?G.teal:G.red} icon="📊"/>
        </div>
        {catSummary.length>0&&<Card>
          <div style={{fontWeight:600,fontSize:13,color:G.text,marginBottom:12}}>Spending by Category (will update Budget tab)</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {catSummary.map(([cat,amt])=><div key={cat}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <div style={{display:"flex",alignItems:"center",gap:7}}><div style={{width:8,height:8,borderRadius:"50%",background:CAT_COLOR[cat]||G.muted}}/><span style={{fontSize:12,color:G.text}}>{cat}</span></div>
                <span style={{fontSize:12,fontFamily:"monospace",color:G.muted}}>{fmt(amt)}</span>
              </div>
              <Bar value={amt} max={catSummary[0][1]} color={CAT_COLOR[cat]||G.muted} h={5}/>
            </div>)}
          </div>
        </Card>}
        <Card style={{padding:0,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"90px 1fr 110px 110px",padding:"9px 16px",borderBottom:`1px solid ${G.border}`,color:G.muted,fontSize:10,fontWeight:700,letterSpacing:.8,textTransform:"uppercase"}}>
            <span>Date</span><span>Description</span><span>Category</span><span style={{textAlign:"right"}}>Amount</span>
          </div>
          <div style={{maxHeight:320,overflowY:"auto"}}>
            {preview.slice(0,50).map((t,i)=><div key={t.id} style={{display:"grid",gridTemplateColumns:"90px 1fr 110px 110px",padding:"9px 16px",borderBottom:`1px solid ${G.border}22`,alignItems:"center",background:i%2===0?"transparent":G.card2}}>
              <span style={{fontSize:11,color:G.muted,fontFamily:"monospace"}}>{t.date}</span>
              <span style={{fontSize:12,color:G.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.desc}</span>
              <span><Pill label={t.category} color={CAT_COLOR[t.category]||G.muted}/></span>
              <span style={{textAlign:"right",fontWeight:700,color:t.type==="income"?G.teal:G.red,fontSize:12,fontFamily:"monospace"}}>{t.type==="income"?"+":"-"}{fmt(t.amount)}</span>
            </div>)}
            {preview.length>50&&<div style={{textAlign:"center",padding:12,color:G.muted,fontSize:12}}>…and {preview.length-50} more rows</div>}
          </div>
        </Card>
        <div style={{display:"flex",gap:10}}>
          <Btn outline onClick={()=>setStep("map")} style={{flex:1}}>← Adjust Mapping</Btn>
          <Btn onClick={doImport} disabled={importing} style={{flex:2,background:G.teal}}>{importing?"Importing…":`✅ Import ${preview.length} Transactions`}</Btn>
        </div>
      </div>}

      {/* STEP 4: Done */}
      {step==="done"&&<Card style={{textAlign:"center",padding:48}}>
        <div style={{fontSize:56,marginBottom:16}}>🎉</div>
        <div style={{fontWeight:800,fontSize:20,color:G.teal,marginBottom:8}}>Import Complete!</div>
        <div style={{color:G.muted,fontSize:14,marginBottom:8}}>{stats?.total} transactions imported successfully.</div>
        <div style={{color:G.muted,fontSize:13,marginBottom:28}}>Dashboard, Budget, Calendar, and all other tabs have been updated automatically.</div>
        <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
          <Btn onClick={reset}>📥 Import Another File</Btn>
        </div>
      </Card>}
    </div>
  );
}


/* ── ADMIN DASHBOARD ── */
function AdminDashboard({authUser,fmt}){
  const G=useG();const isMobile=useIsMobile();
  const[stats,setStats]=useState(null);const[loading,setLoading]=useState(true);

  useEffect(()=>{(async()=>{
    // In real deployment, you'd have a server function for this
    // For now, show what we can derive from auth
    setStats({
      totalUsers:"See Supabase Dashboard",
      activeToday:"See Supabase Dashboard",
      yourEmail:authUser?.email,
      memberSince:authUser?.created_at?new Date(authUser.created_at).toLocaleDateString():"—",
      lastSignIn:authUser?.last_sign_in_at?new Date(authUser.last_sign_in_at).toLocaleString():"—",
      supabaseUrl:SB_URL,
    });
    setLoading(false);
  })();},[]);

  if(loading)return<div style={{color:G.muted,padding:40,textAlign:"center"}}>Loading admin data...</div>;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}><div style={{width:40,height:40,borderRadius:10,background:`linear-gradient(135deg,${G.purple},${G.teal})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🛡️</div><div><h2 style={{fontSize:22,fontWeight:700,color:G.text,marginBottom:2}}>Admin Dashboard</h2><p style={{color:G.muted,fontSize:13}}>Platform management — visible only to {ADMIN_EMAIL}</p></div></div>

      <div style={{background:`${G.purple}12`,border:`1px solid ${G.purple}30`,borderRadius:12,padding:"14px 18px",fontSize:13,color:G.muted}}>
        <strong style={{color:G.text}}>📊 Full user stats</strong> are available in your <a href={`${SB_URL.replace('.supabase.co','')}.supabase.co`} target="_blank" rel="noreferrer" style={{color:G.teal}}>Supabase Dashboard</a> → Authentication → Users. Row Level Security ensures you cannot access other users' financial data from this interface.
      </div>

      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
        <Card>
          <div style={{fontWeight:600,fontSize:14,color:G.text,marginBottom:14}}>👤 Your Account</div>
          {[["Email",stats.yourEmail],["Member Since",stats.memberSince],["Last Sign In",stats.lastSignIn],["Role","Admin"]].map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${G.border}`}}><span style={{fontSize:12,color:G.muted}}>{k}</span><span style={{fontSize:12,color:G.text,fontWeight:500}}>{v}</span></div>)}
        </Card>
        <Card>
          <div style={{fontWeight:600,fontSize:14,color:G.text,marginBottom:14}}>⚡ Quick Actions</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",background:G.card2,borderRadius:9,border:`1px solid ${G.border}`,textDecoration:"none",color:G.text,fontSize:13}}><span>📊</span>Supabase Dashboard → Users</a>
            <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",background:G.card2,borderRadius:9,border:`1px solid ${G.border}`,textDecoration:"none",color:G.text,fontSize:13}}><span>🗄️</span>Supabase Dashboard → Database</a>
            <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",background:G.card2,borderRadius:9,border:`1px solid ${G.border}`,textDecoration:"none",color:G.text,fontSize:13}}><span>📧</span>Supabase Dashboard → Auth Logs</a>
          </div>
        </Card>
      </div>

      <Card>
        <div style={{fontWeight:600,fontSize:14,color:G.text,marginBottom:8}}>🔐 Row Level Security Status</div>
        <div style={{fontSize:12,color:G.muted,marginBottom:14}}>These RLS policies must be enabled in your Supabase database to ensure user data isolation.</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {[
            ["fintrack_data — SELECT","Users can only read their own rows","Enable in Supabase SQL Editor"],
            ["fintrack_data — INSERT","Users can only write their own rows","Enable in Supabase SQL Editor"],
            ["fintrack_data — DELETE","Users can only delete their own rows","Enable in Supabase SQL Editor"],
          ].map(([policy,desc,action])=><div key={policy} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:G.card2,borderRadius:9,border:`1px solid ${G.border}`}}>
            <div><div style={{fontSize:12,fontWeight:500,color:G.text}}>{policy}</div><div style={{fontSize:11,color:G.muted}}>{desc}</div></div>
            <Pill label={action} color={G.gold}/>
          </div>)}
        </div>
        <div style={{marginTop:14,background:G.card2,borderRadius:10,padding:"12px 14px"}}>
          <div style={{fontWeight:600,fontSize:12,color:G.text,marginBottom:6}}>SQL to run in Supabase SQL Editor:</div>
          <code style={{display:"block",fontSize:10,color:G.teal,fontFamily:"monospace",lineHeight:1.6,whiteSpace:"pre-wrap"}}>
{`-- Add user_id column to your fintrack_data table
ALTER TABLE fintrack_data ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Enable RLS
ALTER TABLE fintrack_data ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users see own data" ON fintrack_data FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own data" ON fintrack_data FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own data" ON fintrack_data FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own data" ON fintrack_data FOR DELETE USING (auth.uid() = user_id);`}
          </code>
        </div>
      </Card>
    </div>
  );
}

/* ── ROOT ── */
const TABS=[{id:"dashboard",label:"Dashboard",icon:"📊"},{id:"import",label:"Import",icon:"📥"},{id:"reports",label:"Reports",icon:"📈"},{id:"alerts",label:"Alerts",icon:"🚨"},{id:"search",label:"Search",icon:"🔍"},{id:"transactions",label:"Transactions",icon:"💳"},{id:"calendar",label:"Calendar",icon:"📅"},{id:"recurring",label:"Recurring",icon:"🔁"},{id:"budget",label:"Budget",icon:"🎯"},{id:"subscriptions",label:"Subscriptions",icon:"🔄"},{id:"goals",label:"Goals",icon:"🏆"},{id:"networth",label:"Net Worth",icon:"💎"},{id:"cards",label:"Cards",icon:"💳"},{id:"audit",label:"Audit Log",icon:"🔐"}];
const SEED_RECURRING=[];

export default function App(){
  const [isDark,setIsDark]=useState(false);const G=isDark?DARK:LIGHT;
  const isMobile=useIsMobile();

  // ── AUTH STATE ──────────────────────────────────────────────────────────────
  const [authUser,setAuthUser]=useState(null);         // logged-in user object
  const [authLoading,setAuthLoading]=useState(true);   // checking session
  const [profileOpen,setProfileOpen]=useState(false);  // user profile modal

  // ── APP STATE ───────────────────────────────────────────────────────────────
  const [tab,setTab]=useState("dashboard");
  const [transactions,setTransactions]=useState([]);
  const [budgets,setBudgets]=useState([]);
  const [subscriptions,setSubscriptions]=useState([]);
  const [goals,setGoals]=useState([]);
  const [assets,setAssets]=useState([]);
  const [liabilities,setLiabilities]=useState([]);
  const [netWorthHistory,setNetWorthHistory]=useState([]);
  const [cards,setCards]=useState([]);
  const [recurring,setRecurring]=useState([]);
  const [currency,setCurrencyPref]=useState("USD");
  const [loaded,setLoaded]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [toast,setToast]=useState(null);
  const [auditLog,setAuditLog]=useState([]);
  const [lockWarn,setLockWarn]=useState(false);
  const inactTimer=useRef();const warnTimer=useRef();

  const showToast=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),3500);};
  const addAudit=(event,detail,icon="📝")=>{const time=new Date().toLocaleTimeString();setAuditLog(l=>[{time,event,detail,icon},...l].slice(0,100));};
  const fmt=n=>{const sym=CURRENCIES.find(c=>c.code===currency)?.symbol||"$";const abs=Math.abs(n);const s=abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,",");return`${n<0?"-":""}${sym}${s}`;};

  // ── CHECK SESSION ON MOUNT ───────────────────────────────────────────────────
  useEffect(()=>{(async()=>{
    const u=await auth.getUser();
    if(u){setAuthUser(u);await loadUserData();}
    setAuthLoading(false);
  })();},[]);

  // ── LOAD USER DATA FROM SUPABASE ─────────────────────────────────────────────
  const loadUserData=async()=>{
    setLoaded(false);
    setTransactions(await store.get("transactions")||SEED_TXN);
    setBudgets(await store.get("budgets")||SEED_BUDGETS);
    setSubscriptions(await store.get("subscriptions")||SEED_SUBS);
    setGoals(await store.get("goals")||SEED_GOALS);
    setAssets(await store.get("assets")||SEED_ASSETS);
    setLiabilities(await store.get("liabilities")||SEED_LIAB);
    setNetWorthHistory(await store.get("netWorthHistory")||SEED_NWH);
    setCards(await store.get("cards")||SEED_CARDS);
    setRecurring(await store.get("recurring")||[]);
    const savedCurrency=await store.get("currency");if(savedCurrency)setCurrencyPref(savedCurrency);
    setLoaded(true);
    addAudit("Data loaded","All user data fetched","📦");
  };

  // ── HANDLE LOGIN ─────────────────────────────────────────────────────────────
  const handleLogin=async(user)=>{
    setAuthUser(user);
    addAudit("Sign in",`${user.email} logged in`,"🔓");
    await loadUserData();
  };

  // ── HANDLE SIGN OUT ──────────────────────────────────────────────────────────
  const handleSignOut=async()=>{
    if(!window.confirm("Sign out of FinTrack Pro?"))return;
    addAudit("Sign out",`${authUser?.email} signed out`,"🔒");
    await auth.signOut();
    setAuthUser(null);setLoaded(false);
    setTransactions([]);setBudgets([]);setSubscriptions([]);setGoals([]);
    setAssets([]);setLiabilities([]);setCards([]);setNetWorthHistory([]);setRecurring([]);
    setProfileOpen(false);setSettingsOpen(false);
  };

  // ── AUTO-INACTIVITY LOGOUT (15 min) ─────────────────────────────────────────
  useEffect(()=>{
    if(!authUser)return;
    const reset=()=>{
      clearTimeout(inactTimer.current);clearTimeout(warnTimer.current);setLockWarn(false);
      warnTimer.current=setTimeout(()=>setLockWarn(true),14*60*1000);
      inactTimer.current=setTimeout(async()=>{setLockWarn(false);await handleSignOut();},15*60*1000);
    };
    reset();
    const evs=["mousemove","keydown","click","touchstart"];
    evs.forEach(e=>document.addEventListener(e,reset));
    return()=>{evs.forEach(e=>document.removeEventListener(e,reset));clearTimeout(inactTimer.current);clearTimeout(warnTimer.current);};
  },[authUser]);

  // ── AUTO-RUN RECURRING TRANSACTIONS ─────────────────────────────────────────
  useEffect(()=>{
    if(!loaded||!recurring.length)return;
    const day=new Date().getDate();
    const due=recurring.filter(r=>r.active&&r.dayOfMonth===day&&r.lastRun!==todayStr());
    if(!due.length)return;
    (async()=>{
      let newTxns=[...transactions];
      const updatedRec=recurring.map(r=>{
        if(!due.find(d=>d.id===r.id))return r;
        const t={id:uid(),date:todayStr(),desc:r.desc,amount:r.amount,type:r.type,category:r.category,note:"[Auto-Recurring]"};
        newTxns=[t,...newTxns];return{...r,lastRun:todayStr()};
      });
      setTransactions(newTxns);await store.set("transactions",newTxns);
      setRecurring(updatedRec);await store.set("recurring",updatedRec);
      showToast(`${due.length} recurring transaction(s) added`);
    })();
  },[loaded]);

  const allData={transactions,budgets,subscriptions,goals,assets,liabilities,cards,recurring};

  const handleImport=async(d)=>{
    if(d.transactions){setTransactions(d.transactions);await store.set("transactions",d.transactions);}
    if(d.budgets){setBudgets(d.budgets);await store.set("budgets",d.budgets);}
    if(d.subscriptions){setSubscriptions(d.subscriptions);await store.set("subscriptions",d.subscriptions);}
    if(d.goals){setGoals(d.goals);await store.set("goals",d.goals);}
    if(d.assets){setAssets(d.assets);await store.set("assets",d.assets);}
    if(d.liabilities){setLiabilities(d.liabilities);await store.set("liabilities",d.liabilities);}
    if(d.cards){setCards(d.cards);await store.set("cards",d.cards);}
    if(d.recurring){setRecurring(d.recurring);await store.set("recurring",d.recurring);}
    showToast("Backup imported — all tabs updated");
    addAudit("JSON Import","Backup file imported","📤");
  };

  const clearAll=async()=>{
    if(!window.confirm("Delete ALL your data? This cannot be undone."))return;
    await store.deleteAll();
    setTransactions([]);setBudgets(SEED_BUDGETS);setSubscriptions([]);setGoals([]);
    setAssets([]);setLiabilities([]);setCards([]);setNetWorthHistory([]);setRecurring([]);
    setCurrencyPref("USD");setSettingsOpen(false);
    showToast("All data cleared");
    addAudit("Data cleared","All financial data deleted","🗑️");
  };

  // ── LOADING SCREEN ───────────────────────────────────────────────────────────
  if(authLoading)return(
    <ThemeCtx.Provider value={G}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",flexDirection:"column",gap:12,background:G.bg,fontFamily:"'Sora',sans-serif"}}>
        <div style={{width:36,height:36,border:`3px solid ${G.border}`,borderTop:`3px solid ${G.teal}`,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{color:G.muted,fontSize:13}}>Loading FinTrack Pro...</div>
      </div>
    </ThemeCtx.Provider>
  );

  // ── NOT LOGGED IN → SHOW LOGIN SCREEN ───────────────────────────────────────
  if(!authUser)return(
    <ThemeCtx.Provider value={G}>
      <LoginScreen onLogin={handleLogin}/>
    </ThemeCtx.Provider>
  );

  // ── LOGGED IN BUT DATA NOT YET LOADED ───────────────────────────────────────
  if(!loaded)return(
    <ThemeCtx.Provider value={G}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",flexDirection:"column",gap:12,background:G.bg,fontFamily:"'Sora',sans-serif"}}>
        <div style={{width:36,height:36,border:`3px solid ${G.border}`,borderTop:`3px solid ${G.teal}`,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{color:G.muted,fontSize:13}}>Loading your data...</div>
      </div>
    </ThemeCtx.Provider>
  );

  return(
    <ThemeCtx.Provider value={G}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{background:${G.bg};color:${G.text};font-family:'Sora',sans-serif}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:${G.bg}}::-webkit-scrollbar-thumb{background:${G.border};border-radius:2px}select option{background:${G.card};color:${G.text}}@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.fade{animation:fadeIn .25s ease forwards}`}</style>
      {lockWarn&&<div style={{position:"fixed",top:16,right:16,zIndex:999,background:G.gold,color:"#fff",borderRadius:12,padding:"10px 16px",fontSize:13,fontWeight:600,boxShadow:"0 4px 16px rgba(0,0,0,.2)"}}>⏰ Auto-locking in 1 minute</div>}
      {toast&&<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:1001,background:toast.type==="error"?G.red:G.green,color:"#fff",borderRadius:12,padding:"10px 20px",fontSize:13,fontWeight:600,boxShadow:"0 4px 16px rgba(0,0,0,.2)",whiteSpace:"nowrap"}}>{toast.type==="error"?"❌":"✅"} {toast.msg}</div>}
      <div style={{display:"flex",minHeight:"100vh",background:G.bg}}>
        {/* ── DESKTOP SIDEBAR ── */}
        {!isMobile&&<div style={{width:215,flexShrink:0,background:G.sidebar,borderRight:`1px solid ${G.border}`,display:"flex",flexDirection:"column",position:"fixed",top:0,bottom:0,left:0,boxShadow:"2px 0 8px rgba(0,0,0,.05)"}}>
          <div style={{padding:"18px 14px",borderBottom:`1px solid ${G.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}><div style={{width:32,height:32,borderRadius:8,background:`linear-gradient(135deg,${G.teal},${G.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>💼</div><div><div style={{fontWeight:800,fontSize:13,color:G.text}}>FinTrack Pro</div><div style={{color:G.muted,fontSize:9}}>Personal Finance</div></div></div>
            {/* User card */}
            <button onClick={()=>setProfileOpen(true)} style={{width:"100%",display:"flex",alignItems:"center",gap:9,padding:"9px 10px",borderRadius:10,border:`1px solid ${G.border}`,background:G.card2,cursor:"pointer",textAlign:"left"}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:`linear-gradient(135deg,${G.teal},${G.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",flexShrink:0}}>
                {(authUser?.user_metadata?.display_name||authUser?.email||"?").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2)}
              </div>
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontSize:11,fontWeight:600,color:G.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{authUser?.user_metadata?.display_name||"My Account"}</div>
                <div style={{fontSize:9,color:G.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{authUser?.email}</div>
              </div>
              <span style={{color:G.muted,fontSize:10}}>›</span>
            </button>
          </div>
          <nav style={{padding:"10px 8px",flex:1,overflowY:"auto"}}>
            {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",alignItems:"center",gap:9,width:"100%",padding:"9px 10px",borderRadius:9,border:"none",cursor:"pointer",textAlign:"left",background:tab===t.id?`${G.teal}14`:"none",color:tab===t.id?G.teal:G.muted,fontFamily:"'Sora',sans-serif",fontWeight:tab===t.id?600:400,fontSize:13,marginBottom:2}}><span style={{fontSize:15}}>{t.icon}</span>{t.label}{tab===t.id&&<div style={{marginLeft:"auto",width:3,height:14,background:G.teal,borderRadius:99}}/>}</button>)}
          </nav>
          <div style={{padding:"12px 8px",borderTop:`1px solid ${G.border}`,display:"flex",flexDirection:"column",gap:2}}>
            <button onClick={()=>setSettingsOpen(true)} style={{display:"flex",alignItems:"center",gap:9,width:"100%",padding:"9px 10px",borderRadius:9,border:"none",cursor:"pointer",background:"none",color:G.muted,fontFamily:"inherit",fontSize:13,textAlign:"left"}}>⚙️ Settings</button>
            {auth.isAdmin()&&<button onClick={()=>setTab("admin")} style={{display:"flex",alignItems:"center",gap:9,width:"100%",padding:"9px 10px",borderRadius:9,border:"none",cursor:"pointer",background:tab==="admin"?`${G.purple}14`:"none",color:tab==="admin"?G.purple:G.muted,fontFamily:"inherit",fontSize:13,textAlign:"left"}}>🛡️ Admin</button>}
            <button onClick={handleSignOut} style={{display:"flex",alignItems:"center",gap:9,width:"100%",padding:"9px 10px",borderRadius:9,border:"none",cursor:"pointer",background:"none",color:G.muted,fontFamily:"inherit",fontSize:13,textAlign:"left"}}>🔒 Sign Out</button>
          </div>
        </div>}
        {/* ── MAIN CONTENT ── */}
        <div style={{flex:1,marginLeft:isMobile?0:215,padding:isMobile?"16px 14px 90px":"28px 32px",maxWidth:isMobile?"100vw":"calc(100vw - 215px)",overflowX:"hidden"}}>
          {/* Mobile header */}
          {isMobile&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:28,height:28,borderRadius:7,background:`linear-gradient(135deg,${G.teal},${G.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>💼</div>
              <div style={{fontWeight:800,fontSize:14,color:G.text}}>FinTrack Pro</div>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              {lockWarn&&<span style={{fontSize:11,color:G.gold,fontWeight:600}}>⏰</span>}
              <button onClick={()=>setProfileOpen(true)} style={{width:30,height:30,borderRadius:"50%",background:`linear-gradient(135deg,${G.teal},${G.purple})`,border:"none",cursor:"pointer",color:"#fff",fontSize:11,fontWeight:700}}>
                {(authUser?.user_metadata?.display_name||authUser?.email||"?").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2)}
              </button>
              <button onClick={()=>setSettingsOpen(true)} style={{background:"none",border:`1px solid ${G.border}`,borderRadius:8,padding:"6px 10px",cursor:"pointer",color:G.muted,fontSize:12}}>⚙️</button>
              <button onClick={handleSignOut} style={{background:"none",border:`1px solid ${G.border}`,borderRadius:8,padding:"6px 10px",cursor:"pointer",color:G.muted,fontSize:12}}>🔒</button>
            </div>
          </div>}
          <div>
            {authUser&&!authUser.email_confirmed_at&&authUser.created_at&&(new Date()-new Date(authUser.created_at)<7*24*60*60*1000)&&<ConfirmBanner email={authUser.email}/>}
            {lockWarn&&<div style={{background:`${G.gold}18`,border:`1px solid ${G.gold}40`,borderRadius:10,padding:"10px 14px",fontSize:12,color:G.gold,marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span>⏰ Session expires in 1 minute due to inactivity</span><button onClick={()=>setLockWarn(false)} style={{background:"none",border:"none",color:G.gold,cursor:"pointer",fontSize:14}}>✕</button></div>}
            <div style={{display:tab==="admin"&&auth.isAdmin()?"block":"none"}}><AdminDashboard authUser={authUser} fmt={fmt}/></div>
            <div style={{display:tab==="dashboard"?"block":"none"}}><Dashboard transactions={transactions} budgets={budgets} subscriptions={subscriptions} goals={goals} netWorthHistory={netWorthHistory} fmt={fmt}/></div>
            <div style={{display:tab==="import"?"block":"none"}}><ImportTab transactions={transactions} setTransactions={setTransactions} budgets={budgets} setBudgets={setBudgets} showToast={showToast} fmt={fmt} addAudit={addAudit}/></div>
            <div style={{display:tab==="reports"?"block":"none"}}><Reports transactions={transactions} budgets={budgets} fmt={fmt}/></div>
            <div style={{display:tab==="alerts"?"block":"none"}}><SpendingAlerts transactions={transactions} budgets={budgets} subscriptions={subscriptions} fmt={fmt}/></div>
            <div style={{display:tab==="search"?"block":"none"}}><GlobalSearch transactions={transactions} subscriptions={subscriptions} goals={goals} cards={cards} budgets={budgets} fmt={fmt} setTab={setTab}/></div>
            <div style={{display:tab==="transactions"?"block":"none"}}><Transactions transactions={transactions} setTransactions={setTransactions} showToast={showToast} fmt={fmt}/></div>
            <div style={{display:tab==="calendar"?"block":"none"}}><CalendarView transactions={transactions} fmt={fmt}/></div>
            <div style={{display:tab==="recurring"?"block":"none"}}><Recurring transactions={transactions} setTransactions={setTransactions} recurring={recurring} setRecurring={setRecurring} showToast={showToast} fmt={fmt}/></div>
            <div style={{display:tab==="budget"?"block":"none"}}><Budget transactions={transactions} budgets={budgets} setBudgets={setBudgets} showToast={showToast} fmt={fmt}/></div>
            <div style={{display:tab==="subscriptions"?"block":"none"}}><Subscriptions subscriptions={subscriptions} setSubscriptions={setSubscriptions} showToast={showToast} fmt={fmt}/></div>
            <div style={{display:tab==="goals"?"block":"none"}}><Goals goals={goals} setGoals={setGoals} showToast={showToast} fmt={fmt}/></div>
            <div style={{display:tab==="networth"?"block":"none"}}><NetWorth assets={assets} setAssets={setAssets} liabilities={liabilities} setLiabilities={setLiabilities} netWorthHistory={netWorthHistory} setNetWorthHistory={setNetWorthHistory} showToast={showToast} fmt={fmt}/></div>
            <div style={{display:tab==="cards"?"block":"none"}}><CreditCards cards={cards} setCards={setCards} showToast={showToast} fmt={fmt}/></div>
            <div style={{display:tab==="audit"?"block":"none"}}><AuditLog auditLog={auditLog}/></div>
          </div>
        </div>
        {/* ── MOBILE BOTTOM NAV ── */}
        {isMobile&&<div style={{position:"fixed",bottom:0,left:0,right:0,background:G.sidebar,borderTop:`1px solid ${G.border}`,display:"flex",zIndex:100,boxShadow:"0 -2px 12px rgba(0,0,0,.08)"}}>
          {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"8px 2px",border:"none",background:"none",cursor:"pointer",color:tab===t.id?G.teal:G.muted,fontFamily:"inherit",minWidth:0}}>
            <span style={{fontSize:18,lineHeight:1}}>{t.icon}</span>
            <span style={{fontSize:9,fontWeight:tab===t.id?700:400,marginTop:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%"}}>{t.label}</span>
            {tab===t.id&&<div style={{width:16,height:2,background:G.teal,borderRadius:99,marginTop:3}}/>}
          </button>)}
        </div>}
      </div>
      {settingsOpen&&<Settings onClose={()=>setSettingsOpen(false)} isDark={isDark} setIsDark={setIsDark} allData={allData} onLock={handleSignOut} onClearData={clearAll} currency={currency} setCurrencyPref={async(c)=>{setCurrencyPref(c);await store.set("currency",c);}} onImport={handleImport} showToast={showToast}/>}
      {profileOpen&&<UserProfile user={authUser} onSignOut={handleSignOut} showToast={showToast} isDark={isDark} setIsDark={setIsDark} currency={currency} setCurrencyPref={async(c)=>{setCurrencyPref(c);await store.set("currency",c);}} onClose={()=>setProfileOpen(false)}/>}
    </ThemeCtx.Provider>
  );
}
