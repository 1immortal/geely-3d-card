/*!
 * Geely 3D Card - a Home Assistant Lovelace card for Geely cars
 * (entities from the Geely Connect custom integration).
 * Vanilla web component, no build step, no external dependencies.
 * https://github.com/1immortal/geely-3d-card - MIT License
 */
const GEC_VERSION = '1.9.0';
const GEC_BAD = ['unknown', 'unavailable', 'none', ''];

/* One command queue per car (entity prefix), shared by every card instance on the page.
 * The car drops a command that arrives while it is still executing the previous one
 * (Geely error 8070, "the last request has not yet been executed"), so car commands are
 * queued and spaced; a busy refusal is retried once after the cooldown. */
const GEC_GATES = new Map();
function GEC_gate(key) {
  let g = GEC_GATES.get(key);
  if (!g) { g = { tail: Promise.resolve(), last: 0, pending: 0 }; GEC_GATES.set(key, g); }
  return g;
}

/* Per-model profiles. `direction` is the rotation sense of the frame set (1 = frame numbers turn the car
 * clockwise seen from above, like geely.com's EX5 and Geely Europe's E5 sets; -1 = the opposite, like the Geely Australia sets).
 * `studio` = background colour of frame sets that are not transparent (the stage is drawn as a matching panel).
 * Entities are always discovered at runtime; a block whose entities do not exist is hidden. */
const GEC_MODELS = {
  ex5: { name: 'Geely EX5', drive: 'bev', frames: 24, start: 5, direction: 1, color: 'silver', ext: 'webp', studio: null,
    match: /(?:^|[^a-z0-9])ex\s?5(?:[^a-z0-9]|$)|e245/i },
  e5: { name: 'Geely E5', drive: 'bev', frames: 24, start: 5, direction: 1, color: 'silver', ext: 'webp', studio: '#ffffff',
    match: /(?:^|[^a-z0-9])e\s?5(?:[^a-z0-9]|$)/i },
  ex2: { name: 'Geely EX2', drive: 'bev', frames: 24, start: 21, direction: -1, color: 'star-silver', ext: 'webp', studio: '#f5f3f1',
    match: /(?:^|[^a-z0-9])(?:ex\s?2|e2)(?:\s?max\+?)?(?:[^a-z0-9]|$)/i },
  starray_emi: { name: 'Geely Starray EM-i', drive: 'phev', frames: 24, start: 21, direction: -1, color: 'cloudveil-silver', ext: 'webp', studio: '#f9f3f0',
    match: /starray|p145/i },
  generic: { name: 'Geely', drive: 'auto', frames: 1, start: 1, direction: 1, color: null, ext: 'webp', studio: null, match: null },
};

/* Public 360° frame URLs used when image_source is 'geely'.
 * Patterns and colour lists match scripts/fetch_images.py (EX5, E5 templates; EX2 / Starray
 * lists are the first complete 24-frame set from the same Geely Australia configurator pages
 * the fetch script parses). These URLs are hotlinked, not redistributed. */
const GEC_CDN = {
  ex5: {
    default: 'silver', first: 1, pad: 0, ext: 'png',
    colors: ['silver', 'grey', 'green', 'black', 'white'],
    url: 'https://www.geely.com/-/media/project/web-portal/models/ex5/model-colors/new/{c}/ex5-{c}---{n}.png',
  },
  e5: {
    default: 'silver', first: 0, pad: 2, ext: 'jpg',
    colors: ['silver', 'gray', 'white', 'black', 'green'],
    url: 'https://assets.geelyauto.eu/__frames__/exterior/geely-e5/lhd/23f/{c}/{n}.jpg',
  },
  ex2: {
    default: "star-silver", host: 'https://a-ap.storyblok.com/f/3000753/4431x2954/',
    colors: {
      "aurora-green": { f: "ex2_complete_aurora-green_360_{n}.jpg", h: ["22d02906df","8bb5f2bb75","c57c37fb3e","f817efa3b0","8ed1573b76","333da72d92","9b0ca3f310","1b42978364","52f28fc679","294b749613","85247419cb","813731bd26","d7b685d5e7","a3d1555a54","0a7a2ac27a","aa89e391b1","8ce737bdaf","6311826b3c","06348bf31b","9f64c2cb79","3e2abbd8a7","792631d2f8","58df9c5fca","6fcdf621d6"] },
      "comet-grey": { f: "ex2_complete_comet-gray_360_{n}.jpg", h: ["fa346ce164","58c55241fc","2126271b59","c6f8474820","0e9eba6ba9","3504d47243","1d93559e97","79c1c50822","a25909de33","36753fc5b4","a65ddec4e2","60489c2f9f","b8f6a38221","74dba136e7","ddcb08632c","2d00bd98b0","14fa0a1a6d","bbb0f4c999","e63cbc58bb","5c236b6ad8","3e3226962e","1f61244f60","ba7cce9f34","45a99b1ed1"] },
      "moon-white": { f: "ex2_complete_moon-white_360_{n}.jpg", h: ["51c16730ef","73ae41b061","786cc8e29f","f76bad8329","5c99d7084f","bd13dad88d","ea0030cc6d","27e05c6abd","8239ef0cc6","ff64a872c7","5020f093f7","1a018434a8","d99160ef88","cb8db0302c","9e039aafed","de6c377e8f","d214dea856","e9a19d5d51","3f0d4afb57","de643a7ff8","75665d3822","46723687a0","cc77b3ebd3","12d444f9e1"] },
      "nebula-beige": { f: "ex2_complete_nebula-beige_360_{n}.jpg", h: ["4ea56e6acc","55fe46ef76","86641659ef","4dc48fcbef","4a6f851c39","12d349bff2","f43dc0fb9b","54ad75999e","28dfbaeef5","0daf7515f2","534748b298","100904f451","e7cc4f58ce","498a6b3cca","742ca52725","27d54d37bd","2fa36f48a3","df50cb1582","cb846e76f1","d355235851","83a7b2199d","111fbb583b","c9a2b01b52","7a37badf38"] },
      "nova-pink": { f: "ex2_inspire_nova-pink_360_{n}.jpg", h: ["3933cf3fe3","ec1e97fb17","7a5e8821b3","eb84484c15","534cdda608","00048de040","cfe1d2d6d5","9a6965dc3c","ff78133889","8d7b6c03fb","1744a3a540","8e64c18265","b5840a102d","c5336265a0","33258b9fca","3ae850c97b","45eb99005a","2ca57582f5","1949556c82","4b9fecde5a","5d18003bba","f3e3910aec","34e336e8b2","f2b9d6ff70"] },
      "star-silver": { f: "ex2_complete_star-silver_360_{n}.jpg", h: ["10d17bbb76","9d99fce233","4874b08d1d","2060912f45","dd894d87ad","85cd240be6","3f639ce4f3","d4c2eb4e36","cce2521c45","024d723714","d9383ffc02","056261d1e7","af04ed4661","9b84e20a71","4ee7c6dfb3","b3eedd8ff2","ef20b1319d","16859a5d85","f217c6e6e0","aa5d7f2fed","7839cd0616","5968594c2f","24de026652","9f6445df53"] },
    },
  },
  starray_emi: {
    default: "cloudveil-silver", host: 'https://a-ap.storyblok.com/f/3000753/4431x2954/',
    colors: {
      "alpine-white": { f: "{n}.jpg", h: ["2a2d4b6536","a23e1f3a91","453ba3a1bb","1b9bc1c08a","9480f55875","2b7ab4947d","f047a782c0","7b9ee7dfc1","3025bffbe7","91a1e97ae7","7a304b7a15","3d0a767aab","8a941b5e2c","4b4b084636","78ba515288","58f78838ac","58cda8f46d","411f2bac51","92129f4851","747a9cc199","411892cae5","d55ca9fdd5","0d380c5c7c","82b5500310"] },
      "cloudveil-silver": { f: "{n}.jpg", h: ["5e2ec5764e","cf7c571408","bc98258bd2","8a734ee089","78410df2cf","608dbf8a4c","f32172e9cd","81e7f882b1","6b491f1513","95df80e65f","983c437e6f","0fe107d620","4f086dc50d","55c4f66509","763f7f60e1","cc80a9b31f","c3f5fe10ec","fcd018283a","e0d5543799","44a6e14609","890ac0d38b","71b379e1f6","bedae190eb","330b38845b"] },
      "glacier-blue": { f: "{n}.jpg", h: ["87f84bff32","22d2d8f728","b05e8f3f79","afe021323d","4f974cd6b8","c36b4332e6","70c8717533","ee42622756","a78c7103f7","7ba929635b","d32dd4aa29","455fd39ab4","2dd50cdaab","cb21013f8e","389beeb699","8623f0a337","16e3b5ea03","f79d0e7c38","dd257fcced","5b2346218f","ce69748f2e","380c7f001e","01f053c2d7","f4b75a8bb2"] },
      "jungle-green": { f: "{n}.jpg", h: ["9f707630eb","b6a4cde558","0d8312b083","fabe9242d5","cad4d428fa","279ace9696","b102cccc04","d9a5791e05","88a2771da9","3a9862d46b","dd450cbc4d","8fb55ac800","1e4e4f853f","7db34e2a47","819fcc6c52","1a04d5d0c2","3dbef6e07b","7cf8f2013c","e8b8cf5f1a","2ba8286088","a1e4bb5ada","21bc3f74b4","98e41cfe78","7fd7b009fc"] },
      "polar-black": { f: "{n}.jpg", h: ["b7979f4b91","7e652737b5","8046741274","40d8bcb1c8","236fb1c7bd","b7d7286262","c7ed35c74f","55bc211dad","f29b8c9e30","5f77137d36","4a3a79d507","9693c4766e","9e7f929f83","298a8b8d96","456bcc52b7","7028bd3511","5ee71880f7","239feaeb93","f20245c87e","0b35110a94","b52a364a8e","a4ad3a135c","73550ef927","97f0b34769"] },
      "volcanic-grey": { f: "{n}.jpg", h: ["050ff5b45e","13d9fb90f3","57acf470c3","cc4167b585","7686b4fe58","63e586c8fc","a3311f674f","bd12b0d47f","a413dcbde5","06d86d5f9e","d04010a487","7a61a0b5ca","f93fcb911c","b1d850f903","a25870a7fc","16d0e23a61","f43f2fa866","a4eb5d73a1","99466ef135","456c3a8f21","10f295f4f2","7cc7767d07","171891131f","54fa63679a"] },
    },
  },
};

function GEC_colorLabel(slug) {
  return String(slug || '').split('-').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function GEC_cdnEntry(model) { return GEC_CDN[model] || null; }
function GEC_cdnColors(model) {
  const e = GEC_cdnEntry(model);
  if (!e) return [];
  return Array.isArray(e.colors) ? e.colors.slice() : Object.keys(e.colors);
}
function GEC_cdnDefault(model) { const e = GEC_cdnEntry(model); return (e && e.default) || null; }
function GEC_cdnHasColor(model, color) { return GEC_cdnColors(model).includes(color); }
function GEC_cdnFrameUrl(model, color, frame) {
  const e = GEC_cdnEntry(model);
  if (!e || !color) return null;
  const n = Number(frame);
  if (!Number.isInteger(n) || n < 1) return null;
  if (e.url) {
    if (!e.colors.includes(color)) return null;
    const idx = (e.first || 0) + (n - 1);
    const num = e.pad ? String(idx).padStart(e.pad, '0') : String(idx);
    return e.url.replace(/\{c\}/g, color).replace(/\{n\}/g, num);
  }
  const rec = e.colors[color];
  if (!rec || !rec.h || n > rec.h.length) return null;
  const file = String(rec.f).replace(/\{n\}/g, String(n));
  return `${e.host}${rec.h[n - 1]}/${file}/m/1500x0`;
}


const GEC_I18N = {
  en: {
    loading: 'Loading…', drag: 'Drag to rotate', details: 'Details & controls', yes: 'Confirm', no: 'Cancel',
    connected: 'Connected', disconnected: 'Offline', home: 'Home', away: 'Away', engine_on: 'Engine on', parked: 'Parked',
    updated: 'Updated {t}', car_reported: 'Car last reported {t}', now: 'just now',
    reported: 'Car reported {t}', synced: 'Last sync {t}', stale: 'Old data', service_due: 'Service due',
    charged: 'Charged', eta: 'Done at {t}', t_queued: 'Queued, waiting for the car…', t_noop: 'Already set',
    locked: 'Locked', unlocked: 'Unlocked',
    door_driver: 'Driver door open', door_passenger: 'Passenger door open', door_rear_left: 'Rear left door open',
    door_rear_right: 'Rear right door open', trunk: 'Trunk open', hood: 'Hood open', windows_open: 'Windows open', sunroof_open: 'Sunroof open',
    service_overdue: 'Service overdue', service_today: 'Service today', service_tomorrow: 'Service tomorrow',
    service_days: 'Service in {n} days', service_km: 'Service in {n} km',
    battery_range: 'Battery & range', full_range: 'Full charge: {n} km', km: 'km', kw: 'kW', min: 'min', h: 'h',
    charging: 'Charging', plugged: 'Plugged in', unplugged: 'Not plugged in', power: 'Power', to_full: 'Until full',
    temperature: 'Temperature', cabin: 'Cabin', outside: 'Outside', tires: 'Tire pressure',
    unlock: 'Unlock', lock: 'Lock', precond: 'Pre-condition', climate_off: 'Climate off', start_charge: 'Start charging',
    stop_charge: 'Stop charging', find: 'Find car', refresh: 'Refresh',
    find_map_title: "Where's my car?", find_navigate: 'Navigate', find_waze: 'Waze',
    find_honk: 'Honk & flash', find_close: 'Close', loc_unavailable: 'Location unavailable',
    c_honk: 'Honk and flash the car?',
    pc_title: 'Pre-condition', pc_temp: 'Temperature', pc_auto: 'Normal',
    pc_rapid_cool: 'Rapid Cooling', pc_rapid_warm: 'Rapid Warming',
    pc_defrost: 'Defrost windshield', pc_wheel: 'Steering wheel heat',
    pc_seat_heat: 'Seat heating', pc_seat_vent: 'Seat ventilation',
    pc_driver: 'Driver', pc_passenger: 'Passenger', pc_winvent: 'Window ventilation',
    pc_now: 'Start now', pc_at: 'Start at', pc_stop: 'Stop',
    pc_cool: 'Cool', pc_heat: 'Heat',
    pc_note: 'The car turns the climate off on its own after its built-in time.',
    c_precond: "Start the car's climate remotely?",
    t_pc_sched: 'Pre-conditioning scheduled', t_pc_json: 'Settings are too long to save',
    pc_sending: 'Sending {n}/{t}…', pc_some_failed: 'Some commands failed: {items}',
    pc_hour: 'Hour', pc_minute: 'Minute',
    charger_ctrl_1: 'Charger', charger_ctrl_2: 'control',
    odometer: 'Odometer', to_service: 'To service', consumption: 'Consumption', last_trip: 'Last trip', kwh100: 'kWh/100 km',
    seat_heat_driver: 'Driver seat heating', seat_heat_passenger: 'Passenger seat heating',
    seat_vent_driver: 'Driver seat ventilation', seat_vent_passenger: 'Passenger seat ventilation',
    windows: 'Windows', sunroof: 'Sunroof', sunshade: 'Sunshade', defrost: 'Defrost',
    open: 'Open', close: 'Close', is_open: 'open', is_closed: 'closed', unavailable: 'unavailable', on: 'On', off: 'Off',
    opt_off: 'Off', opt_low: 'Low', opt_medium: 'Medium', opt_high: 'High', no_controls: 'No controls available',
    c_unlock: 'Unlock the car?', c_start: 'Start charging?', c_stop: 'Stop charging?',
    c_open_all_windows: 'Open the windows?', c_open_sunroof: 'Open the sunroof?', c_open_sunshade: 'Open the sunshade?',
    t_sent: 'Sent to car', t_unlock: 'Unlock command sent', t_lock: 'Lock command sent', t_clim_on: 'Pre-conditioning on',
    t_clim_off: 'Pre-conditioning off', t_start: 'Start charging sent', t_stop: 'Stop charging sent',
    t_find: 'The car will flash and beep', t_refresh: 'Refreshing data…', t_updated: 'Updated', t_err: 'Error: {m}', t_failed: 'command failed',
    no_prefix: 'geely-3d-card: "entity_prefix" is required (e.g. my_geely_ex5_1234)',
    fuel: 'Fuel', fuel_range: 'Fuel range', combined: 'Total range: {n} km', ev_range: 'Electric range', litres: 'L',
    fuel_flap: 'Fuel flap open', frunk: 'Front trunk', trunk_btn: 'Trunk', unlock_btn: 'Unlock',
    c_unlock_frunk: 'Open the front trunk?', c_unlock_trunk: 'Unlock the trunk?',
    seat_heat_rear_left: 'Rear left seat heating', seat_heat_rear_right: 'Rear right seat heating',
    seat_vent_rear_left: 'Rear left seat ventilation', seat_vent_rear_right: 'Rear right seat ventilation',
  },
  he: {
    loading: 'טוען…', drag: 'גררו לסיבוב', details: 'פרטים ובקרות', yes: 'אישור', no: 'ביטול',
    connected: 'מחובר', disconnected: 'לא מחובר', home: 'בבית', away: 'מחוץ לבית', engine_on: 'מנוע פועל', parked: 'חונה',
    updated: 'עודכן {t}', car_reported: 'דיווח אחרון מהרכב {t}', now: 'עכשיו',
    reported: 'דיווח מהרכב {t}', synced: 'סנכרון אחרון {t}', stale: 'נתונים ישנים', service_due: 'נדרש טיפול',
    charged: 'טעון במלואו', eta: 'יסתיים ב-{t}', t_queued: 'בתור, ממתין לרכב…', t_noop: 'כבר מוגדר',
    locked: 'נעול', unlocked: 'לא נעול',
    door_driver: 'דלת נהג פתוחה', door_passenger: 'דלת נוסע פתוחה', door_rear_left: 'דלת אחורית שמאל פתוחה',
    door_rear_right: 'דלת אחורית ימין פתוחה', trunk: 'תא מטען פתוח', hood: 'מכסה מנוע פתוח', windows_open: 'חלונות פתוחים', sunroof_open: 'גג נפתח פתוח',
    service_overdue: 'טיפול באיחור', service_today: 'טיפול היום', service_tomorrow: 'טיפול מחר',
    service_days: 'טיפול בעוד {n} ימים', service_km: 'טיפול בעוד {n} ק״מ',
    battery_range: 'סוללה וטווח', full_range: 'בטעינה מלאה {n} ק״מ', km: 'ק״מ', kw: 'קו״ט', min: 'דק׳', h: 'שע׳',
    charging: 'בטעינה', plugged: 'מחובר למטען', unplugged: 'לא מחובר למטען', power: 'הספק', to_full: 'עד טעינה מלאה',
    temperature: 'טמפרטורה', cabin: 'בתא', outside: 'בחוץ', tires: 'לחץ צמיגים',
    unlock: 'פתח נעילה', lock: 'נעל', precond: 'מיזוג מראש', climate_off: 'כבה מיזוג', start_charge: 'התחל טעינה',
    stop_charge: 'עצור טעינה', find: 'מצא רכב', refresh: 'רענן',
    find_map_title: 'איפה הרכב?', find_navigate: 'נווט', find_waze: 'Waze',
    find_honk: 'צפור והבהב', find_close: 'סגור', loc_unavailable: 'מיקום לא זמין',
    c_honk: 'לצפור ולהבהב?',
    pc_title: 'מיזוג מראש', pc_temp: 'טמפרטורה', pc_auto: 'רגיל',
    pc_rapid_cool: 'קירור מהיר', pc_rapid_warm: 'חימום מהיר',
    pc_defrost: 'הפשרת שמשה', pc_wheel: 'חימום הגה',
    pc_seat_heat: 'חימום מושב', pc_seat_vent: 'איוורור מושב',
    pc_driver: 'נהג', pc_passenger: 'נוסע', pc_winvent: 'איוורור חלונות',
    pc_now: 'הפעל עכשיו', pc_at: 'הפעל בשעה', pc_stop: 'עצור',
    pc_cool: 'קירור', pc_heat: 'חימום',
    pc_note: 'הרכב מכבה את המיזוג מעצמו אחרי הזמן המובנה.',
    c_precond: 'להפעיל את מיזוג הרכב מרחוק?',
    t_pc_sched: 'מיזוג מראש תוזמן', t_pc_json: 'ההגדרות ארוכות מדי לשמירה',
    pc_sending: 'שולח {n}/{t}…', pc_some_failed: 'חלק מהפקודות נכשלו: {items}',
    pc_hour: 'שעה', pc_minute: 'דקה',
    charger_ctrl_1: 'שליטת', charger_ctrl_2: 'עמדת טעינה',
    odometer: 'מד מרחק', to_service: 'לטיפול', consumption: 'צריכה', last_trip: 'נסיעה אחרונה', kwh100: 'קוט״ש/100',
    seat_heat_driver: 'חימום מושב נהג', seat_heat_passenger: 'חימום מושב נוסע',
    seat_vent_driver: 'אוורור מושב נהג', seat_vent_passenger: 'אוורור מושב נוסע',
    windows: 'חלונות', sunroof: 'גג נפתח', sunshade: 'וילון גג', defrost: 'הפשרת שמשות',
    open: 'פתח', close: 'סגור', is_open: 'פתוח', is_closed: 'סגור', unavailable: 'לא זמין', on: 'פועל', off: 'כבוי',
    opt_off: 'כבוי', opt_low: 'נמוך', opt_medium: 'בינוני', opt_high: 'גבוה', no_controls: 'אין בקרות זמינות',
    c_unlock: 'לפתוח את נעילת הרכב?', c_start: 'להתחיל טעינה?', c_stop: 'לעצור את הטעינה?',
    c_open_all_windows: 'לפתוח את החלונות?', c_open_sunroof: 'לפתוח את הגג הנפתח?', c_open_sunshade: 'לפתוח את וילון הגג?',
    t_sent: 'נשלח לרכב', t_unlock: 'פקודת פתיחה נשלחה', t_lock: 'פקודת נעילה נשלחה', t_clim_on: 'מיזוג מראש הופעל',
    t_clim_off: 'מיזוג מראש כובה', t_start: 'התחלת טעינה נשלחה', t_stop: 'עצירת טעינה נשלחה',
    t_find: 'הרכב יצפור ויהבהב', t_refresh: 'מרענן נתונים…', t_updated: 'עודכן', t_err: 'שגיאה: {m}', t_failed: 'הפקודה נכשלה',
    no_prefix: 'geely-3d-card: חובה להגדיר "entity_prefix"',
    fuel: 'דלק', fuel_range: 'טווח דלק', combined: 'טווח כולל: {n} ק״מ', ev_range: 'טווח חשמלי', litres: 'ל׳',
    fuel_flap: 'מכסה הדלק פתוח', frunk: 'תא מטען קדמי', trunk_btn: 'תא מטען', unlock_btn: 'פתח',
    c_unlock_frunk: 'לפתוח את תא המטען הקדמי?', c_unlock_trunk: 'לפתוח את נעילת תא המטען?',
    seat_heat_rear_left: 'חימום מושב אחורי שמאל', seat_heat_rear_right: 'חימום מושב אחורי ימין',
    seat_vent_rear_left: 'אוורור מושב אחורי שמאל', seat_vent_rear_right: 'אוורור מושב אחורי ימין',
  },
};

class Geely3DCard extends HTMLElement {
  static getStubConfig(hass) {
    let prefix = 'my_geely_ex5_xxxx';
    if (hass) {
      const id = Object.keys(hass.states).find((e) => /^lock\..*geely.*_doors$/.test(e));
      if (id) prefix = id.slice(5, -6);
    }
    return { entity_prefix: prefix, image_source: 'geely' };
  }
  static getConfigElement() { return document.createElement('geely-3d-card-editor'); }

  setConfig(config) {
    const c = config || {};
    if (!c.entity_prefix) throw new Error(GEC_I18N.en.no_prefix);
    const prefix = String(c.entity_prefix).trim().toLowerCase().replace(/^[a-z][a-z0-9_]*\./, '');
    if (!/^[a-z0-9_]+$/.test(prefix)) {
      throw new Error('geely-3d-card: "entity_prefix" may only contain lowercase letters, digits and underscores');
    }
    const entityIdRe = /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/;
    const entityOpt = (key) => {
      if (c[key] == null || String(c[key]).trim() === '') return null;
      const id = String(c[key]).trim().toLowerCase();
      if (!entityIdRe.test(id)) throw new Error(`geely-3d-card: "${key}" must be a valid entity id`);
      return id;
    };
    for (const key of Object.keys(c)) if (key.endsWith('_entity')) entityOpt(key);
    const chargeDomains = ['button', 'switch', 'script', 'input_button'];
    const chargeOpt = (key, domains = chargeDomains) => {
      const id = entityOpt(key);
      if (!id) return null;
      const domain = id.split('.')[0];
      if (!domains.includes(domain)) {
        throw new Error(`geely-3d-card: "${key}" must be a ${domains.join(', ')} entity`);
      }
      return id;
    };
    const tireUnit = String(c.tire_unit == null || String(c.tire_unit).trim() === '' ? 'bar' : c.tire_unit).trim().toLowerCase();
    if (!['bar', 'psi', 'kpa'].includes(tireUnit)) {
      throw new Error('geely-3d-card: "tire_unit" must be bar, psi or kpa');
    }
    let findAction = null;
    if (c.find_action != null && String(c.find_action).trim() !== '') {
      findAction = String(c.find_action).trim().toLowerCase();
      if (findAction !== 'map' && findAction !== 'honk') {
        throw new Error('geely-3d-card: "find_action" must be map or honk');
      }
    }
    let mapMarker = 'car';
    if (c.map_marker != null && String(c.map_marker).trim() !== '') {
      mapMarker = String(c.map_marker).trim().toLowerCase();
      if (mapMarker !== 'car' && mapMarker !== 'default') {
        throw new Error('geely-3d-card: "map_marker" must be car or default');
      }
    }
    let mapMarkerFrame = null;
    if (c.map_marker_frame != null && String(c.map_marker_frame).trim() !== '') {
      const n = Number(c.map_marker_frame);
      if (!Number.isInteger(n) || n < 1) {
        throw new Error('geely-3d-card: "map_marker_frame" must be a positive integer');
      }
      mapMarkerFrame = n;
    }
    const precondEntities = [];
    if (c.precond_entities != null && String(c.precond_entities).trim() !== '') {
      const list = Array.isArray(c.precond_entities) ? c.precond_entities : [c.precond_entities];
      for (const raw of list) {
        if (raw == null || String(raw).trim() === '') continue;
        const id = String(raw).trim().toLowerCase();
        if (!entityIdRe.test(id)) throw new Error('geely-3d-card: "precond_entities" must be a list of valid entity ids');
        const domain = id.split('.')[0];
        if (domain !== 'switch' && domain !== 'select') {
          throw new Error('geely-3d-card: "precond_entities" entries must be switch or select entities');
        }
        precondEntities.push(id);
      }
    }
    let commandDelay = 2;
    if (c.command_delay != null && String(c.command_delay).trim() !== '') {
      const n = Number(c.command_delay);
      if (!isFinite(n) || n < 0) {
        throw new Error('geely-3d-card: "command_delay" must be a non-negative number of seconds');
      }
      commandDelay = n;
    }
    const numOpt = (key, def) => {
      if (c[key] == null || String(c[key]).trim() === '') return def;
      const n = Number(c[key]);
      if (!isFinite(n) || n < 0) throw new Error(`geely-3d-card: "${key}" must be a non-negative number`);
      return n;
    };
    const staleMinutes = numOpt('stale_minutes', 60);
    const commandCooldown = numOpt('command_cooldown', 3);
    let timeFormat = null;
    if (c.time_format != null && String(c.time_format).trim() !== '') {
      timeFormat = String(c.time_format).trim().toLowerCase();
      if (timeFormat !== '24h' && timeFormat !== '12h') {
        throw new Error('geely-3d-card: "time_format" must be 24h or 12h');
      }
    }
    const ALLOWED_MODELS = ['auto', 'ex5', 'e5', 'ex2', 'starray_emi', 'generic'];
    let model = String(c.model || 'auto').toLowerCase().replace(/[\s-]+/g, '_');
    if (!ALLOWED_MODELS.includes(model)) {
      throw new Error('geely-3d-card: "model" must be auto, ex5, e5, ex2, starray_emi or generic');
    }
    let imageSource = null;
    if (c.image_source != null && String(c.image_source).trim() !== '') {
      imageSource = String(c.image_source).trim().toLowerCase();
      if (imageSource !== 'local' && imageSource !== 'geely') {
        throw new Error('geely-3d-card: "image_source" must be local or geely');
      }
    }
    const colorSlug = (() => {
      const s = String(c.color || '').trim().toLowerCase();
      return /^[a-z0-9][a-z0-9_-]*$/.test(s) ? s : '';
    })();
    if (imageSource === 'geely' && colorSlug) {
      const ok = model !== 'auto' && model !== 'generic'
        ? GEC_cdnHasColor(model, colorSlug)
        : Object.keys(GEC_CDN).some((k) => GEC_cdnHasColor(k, colorSlug));
      if (!ok) {
        throw new Error('geely-3d-card: "color" is not available for this model in geely image mode');
      }
    }
    this._raw = c;
    this._cfg = {
      title: c.title || null,
      model,
      image_source: imageSource,
      prefix,
      climate: entityOpt('climate_entity'),
      language: (c.language || 'auto').toLowerCase(),
      service_days: c.service_warning_days ?? 14,
      service_km: c.service_warning_km ?? 1000,
      low_bar: c.low_tire_bar != null && String(c.low_tire_bar).trim() !== '' ? Number(c.low_tire_bar)
        : c.low_tire_psi != null && String(c.low_tire_psi).trim() !== '' ? Number(c.low_tire_psi) * 0.0689476
        : 2.3,
      tire_unit: tireUnit,
      location: entityOpt('location_entity'),
      find_action: findAction,
      charge_start: chargeOpt('charge_start_entity'),
      charge_stop: chargeOpt('charge_stop_entity'),
      charger_switch: chargeOpt('charger_switch_entity', ['switch']),
      precond_schedule: chargeOpt('precond_schedule_entity', ['input_datetime']),
      precond_enabled: chargeOpt('precond_schedule_enabled_entity', ['input_boolean']),
      precond_settings: chargeOpt('precond_settings_entity', ['input_text']),
      precond_entities: precondEntities,
      map_marker: mapMarker,
      map_marker_frame: mapMarkerFrame,
      command_delay: commandDelay,
      command_cooldown: commandCooldown,
      stale_minutes: staleMinutes,
      time_format: timeFormat,
    };
    this._sigCache = null;
    this._sig = null;
    this._prof = null;
    this._cur = null;
    this._restLoaded = false;
    this._cdnTried = false;
    this._forceCdn = false;
    if (this._escBound) { document.removeEventListener('keydown', this._onEscKey); this._escBound = false; }
    if (this._built) { this._built = false; this.shadowRoot.innerHTML = ''; }
    if (this._hass) this.hass = this._hass;
  }

  connectedCallback() {
    if (this._built && this._el) { this._syncEsc(); this._loadRestFrames(); }
    if (this._built && this._hass) { this._sig = null; this.hass = this._hass; }
  }
  disconnectedCallback() {
    cancelAnimationFrame(this._raf); this._raf = null;
    clearTimeout(this._tt); this._tt = null;
    clearTimeout(this._restTimer); this._restTimer = null;
    if (this._mapHookTimer) { clearTimeout(this._mapHookTimer); this._mapHookTimer = null; }
    if (this._escBound) { document.removeEventListener('keydown', this._onEscKey); this._escBound = false; }
  }

  getCardSize() { return 9; }
  getGridOptions() { return { columns: 'full', min_columns: 6 }; }

  /* ---------- i18n ---------- */
  _langOf(hass) {
    const l = this._cfg.language;
    if (l === 'he' || l === 'en') return l;
    const sys = String((hass && ((hass.locale && hass.locale.language) || hass.language)) || 'en').toLowerCase();
    return sys.startsWith('he') || sys.startsWith('iw') ? 'he' : 'en';
  }
  _t(key, vars) {
    let s = (GEC_I18N[this._lang] || GEC_I18N.en)[key] ?? GEC_I18N.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
    return s;
  }
  get _locale() { return this._lang === 'he' ? 'he-IL' : 'en-US'; }

  /* ---------- helpers ---------- */
  _id(domain, key) { return `${domain}.${this._cfg.prefix}_${key}`; }
  _s(id) { return this._hass && id && this._hass.states[id]; }
  _v(id) { const s = this._s(id); return s && !GEC_BAD.includes(String(s.state).toLowerCase()) ? s.state : null; }
  _n(id) { const v = this._v(id); const n = v == null ? NaN : parseFloat(v); return isFinite(n) ? n : null; }
  _on(id) { return this._v(id) === 'on'; }
  _fmt(n, d = 0) { return n == null ? '—' : Number(n).toLocaleString(this._locale, { maximumFractionDigits: d, minimumFractionDigits: d }); }
  _esc(t) { return String(t ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
  _slug(v) {
    const s = String(v || '').trim().toLowerCase();
    return /^[a-z0-9][a-z0-9_-]*$/.test(s) ? s : '';
  }
  _extOf(v, fallback) {
    const s = String(v || '').trim().toLowerCase().replace(/^\./, '');
    return /^[a-z0-9]+$/.test(s) ? s : fallback;
  }
  _cssColor(v) {
    if (v == null || v === '' || v === false) return null;
    const s = String(v).trim();
    if (s === 'null' || s === 'none') return null;
    if (s === 'transparent') return 'transparent';
    if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return s;
    if (/^(?:rgb|hsl)a?\(\s*[\d.]+%?(?:\s*,\s*[\d.]+%?){2,3}(?:\s*,\s*[\d.]+%?)?\s*\)$/i.test(s)) return s;
    if (/^[a-z]+$/i.test(s)) return s.toLowerCase();
    return null;
  }
  _rel(iso) {
    if (!iso) return null;
    const t = Date.parse(iso); if (!isFinite(t)) return null;
    const sec = Math.round((t - Date.now()) / 1000);
    const a = Math.abs(sec);
    if (a < 60) return this._t('now');
    const rtf = new Intl.RelativeTimeFormat(this._lang, { numeric: 'auto' });
    // Hebrew ICU adds the number to dual forms ("לפני שעתיים (2)"); drop that echo.
    const f = (v, u) => rtf.format(v, u).replace(/\s*\(\d+\)$/, '');
    if (a < 3600) return f(Math.round(sec / 60), 'minute');
    if (a < 86400) return f(Math.round(sec / 3600), 'hour');
    return f(Math.round(sec / 86400), 'day');
  }
  _detectModel() {
    const want = this._cfg.model;
    if (GEC_MODELS[want]) return want;
    const h = this._hass, texts = [this._cfg.prefix];
    const ent = h.entities && (h.entities[this._id('lock', 'doors')] || h.entities[this._id('sensor', 'battery')]);
    const dev = ent && ent.device_id && h.devices && h.devices[ent.device_id];
    if (dev) texts.unshift(dev.model || '', dev.name_by_user || '', dev.name || '');
    const lk = this._s(this._id('lock', 'doors'));
    if (lk) texts.push(lk.attributes.friendly_name || '');
    for (const t of texts) for (const [k, m] of Object.entries(GEC_MODELS)) if (m.match && m.match.test(t)) return k;
    return 'generic';
  }
  _useCdn() {
    if (this._forceCdn) return true;
    if (this._cfg.image_source === 'geely') return true;
    if (this._cfg.image_source === 'local') return false;
    return false;
  }
  _shouldAutoCdn() {
    const c = this._raw || {};
    if (this._cfg.image_source === 'geely' || this._cfg.image_source === 'local') return false;
    if (c.image_base || c.car_image) return false;
    const key = this._detectModel();
    return key !== 'generic' && GEC_cdnColors(key).length > 0;
  }
  _frameSrc(i) {
    const P = this._profile();
    if (P.single) return P.single;
    if (P.cdn) return GEC_cdnFrameUrl(P.key, P.color, i) || '';
    if (!P.base) return '';
    return `${P.base}${i}.${P.ext}`;
  }
  _profile() {
    if (this._prof) return this._prof;
    const c = this._raw, key = this._detectModel(), m = GEC_MODELS[key];
    const single = c.car_image || null;
    const useCdn = this._useCdn() && !single;
    const wanted = this._slug(c.color) || m.color;
    const color = (useCdn && wanted && !GEC_cdnHasColor(key, wanted)) ? m.color : wanted;
    const cdn = useCdn && !!color && GEC_cdnHasColor(key, color);
    let frames = Number(c.frames) || (single ? 1 : m.frames);
    let base = null;
    if (!cdn) {
      base = c.image_base || (color ? `/local/geely-ex5/${key}/${color}/` : null);
      if (base) base = String(base).replace(/\/?$/, '/');
    }
    if (!single && !base && !cdn) frames = 0;
    let ext = this._extOf(c.image_ext, m.ext);
    if (cdn) {
      const e = GEC_cdnEntry(key);
      if (e && e.ext) ext = e.ext;
    }
    this._prof = {
      key, name: m.name, drive: m.drive, frames, base, single, color, cdn,
      ext,
      start: Number(c.start_frame) || m.start,
      direction: Number(c.rotate_direction) || m.direction,
      studio: c.image_background !== undefined ? this._cssColor(c.image_background) : m.studio,
    };
    return this._prof;
  }
  _first(domain, keys) { for (const k of keys) { const id = this._id(domain, k); if (this._s(id)) return id; } return null; }
  _climateId() {
    if (this._cfg.climate) return this._cfg.climate;
    if (this._climAuto !== undefined) return this._climAuto;
    const p = this._cfg.prefix, ids = Object.keys(this._hass.states).filter((e) => e.startsWith('climate.'));
    let found = ids.find((e) => e === `climate.${p}_climate`) || ids.find((e) => e.startsWith(`climate.${p}_`));
    if (!found) {
      // Some installs name the climate entity without the account-specific leading segment(s).
      found = ids.find((e) => { const o = e.slice(8).replace(/_(climate|pre_?conditioning)$/, ''); return o.length > 3 && p.endsWith(o); });
    }
    this._climAuto = found || null;
    return this._climAuto;
  }
  _tireBar(id) {
    const s = this._s(id), v = this._n(id); if (v == null) return null;
    const u = String((s.attributes && s.attributes.unit_of_measurement) || 'psi').toLowerCase();
    if (u === 'bar') return v;
    if (u === 'kpa') return v / 100;
    return v * 0.0689476;
  }
  _tireFromBar(bar) {
    const u = this._cfg.tire_unit;
    if (u === 'psi') return bar / 0.0689476;
    if (u === 'kpa') return bar * 100;
    return bar;
  }
  _tireUnitLabel() { return this._cfg.tire_unit === 'kpa' ? 'kPa' : this._cfg.tire_unit; }

  set hass(hass) {
    this._hass = hass;
    if (!this._cfg) return;
    const lang = this._langOf(hass);
    if (!this._built) { this._lang = lang; this._build(); }
    if (lang !== this._lang) { this._lang = lang; this._applyStatic(); }
    const dark = !!(hass.themes && hass.themes.darkMode);
    this._card.classList.toggle('light', !dark);
    const sig = this._signature(dark);
    if (sig !== this._sig) { this._sig = sig; this._render(); }
    this._updateCarMarker();
  }

  _signature(dark) {
    const p = `.${this._cfg.prefix}_`, clim = this._climateId();
    const extra = [this._chargeStartId(), this._chargeStopId(), this._locationId(),
      this._cfg.precond_schedule, this._cfg.precond_enabled, this._cfg.precond_settings,
      ...((this._cfg.precond_entities) || [])].filter(Boolean);
    const parts = [this._lang, dark ? 'd' : 'l', Math.floor(Date.now() / 60000)];
    const states = this._hass.states;
    const key = `${p}|${clim}|${extra.join(',')}`;
    let c = this._sigCache;
    // Re-scan all states only when the watched set may have changed: other config, a watched entity
    // disappeared, or once a minute to pick up newly added entities. Otherwise read the cached ids.
    if (!c || c.key !== key || Date.now() - c.t > 60000 || c.ids.some((id) => !states[id])) {
      const ids = [];
      for (const id of Object.keys(states)) if (id.includes(p) || id === clim || extra.includes(id)) ids.push(id);
      c = this._sigCache = { key, ids, t: Date.now() };
    }
    for (const id of c.ids) { const s = states[id]; if (s) parts.push(id, s.state, s.attributes.current_position); }
    return parts.join('|');
  }

  /* ---------- static DOM ---------- */
  _build() {
    this._built = true;
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    const P = this._profile();
    const N = P.frames;
    this._pos = Math.min(Math.max(P.start, 1), Math.max(N, 1)) - 1;
    let imgs = '';
    const rp = P.cdn ? ' referrerpolicy="no-referrer"' : '';
    if (P.single) imgs = `<img draggable="false" alt="" src="${this._esc(P.single)}" data-f="0">`;
    else {
      const first = Math.min(Math.max(P.start, 1), Math.max(N, 1));
      for (let i = 1; i <= N; i++) {
        const src = this._esc(this._frameSrc(i));
        // The visible start frame loads first; the rest are filled in once it has arrived.
        imgs += i === first
          ? `<img draggable="false" alt="" src="${src}" data-f="${i - 1}" fetchpriority="high" decoding="async"${rp}>`
          : `<img draggable="false" alt="" data-src="${src}" data-f="${i - 1}" decoding="async"${rp}>`;
      }
    }
    if (!N) imgs = '<div class="ph"><ha-icon icon="mdi:car-side"></ha-icon></div>';
    if (!this._cdnErrBound) {
      this._cdnErrBound = true;
      root.addEventListener('error', (ev) => {
        const t = ev.target;
        if (t && t.tagName === 'IMG' && t.hasAttribute('data-f')) this._onFrameError(t);
      }, true);
    }
    root.innerHTML = `
<style>
  :host { display:block; }
  ha-card { --zc-bg: linear-gradient(180deg,#161c28 0%,#10141d 55%,#0d1118 100%); --zc-fg:#e8eef8; --zc-mut:#9aa3b2;
    --zc-pan:rgba(255,255,255,.045); --zc-pan2:rgba(255,255,255,.08); --zc-brd:rgba(255,255,255,.07);
    --zc-green:#3fbf5f; --zc-red:#ff5252; --zc-amber:#ffc04d; --zc-blue:#4fb3ff; --zc-purple:#b59bff; --zc-teal:#5ed6a8;
    --zc-glow:rgba(79,179,255,.16); --zc-shadow:rgba(0,0,0,.65);
    display:block; overflow:hidden; position:relative; background:var(--zc-bg); color:var(--zc-fg);
    border-radius:var(--ha-card-border-radius,12px); --zc-font: Rubik, var(--ha-font-family-body, var(--paper-font-body1_-_font-family, system-ui)), -apple-system, 'Segoe UI', Roboto, 'Noto Sans Hebrew', Arial, sans-serif; font-family:var(--zc-font);
    container-type:inline-size; }
  ha-card.light { --zc-bg: linear-gradient(180deg,#f7f9fc 0%,#eef2f8 100%); --zc-fg:#1b2230; --zc-mut:#6b7280;
    --zc-pan:rgba(16,20,29,.04); --zc-pan2:rgba(16,20,29,.08); --zc-brd:rgba(16,20,29,.08);
    --zc-green:#23a047; --zc-red:#e53935; --zc-amber:#d98b00; --zc-blue:#1f88e5; --zc-purple:#7c5cff; --zc-teal:#139a74;
    --zc-glow:rgba(31,136,229,.12); --zc-shadow:rgba(16,20,29,.35); }
  .main { display:grid; grid-template-columns:1fr; gap:4px; padding:14px 14px 12px; }
  @container (min-width: 760px) { .main { grid-template-columns: minmax(0,1.3fr) minmax(0,1fr); gap:18px; padding:18px; }
    .left { display:flex; flex-direction:column; } .stage { margin-block:auto; } }
  .left { min-width:0; }
  .head { display:flex; align-items:center; gap:10px; justify-content:space-between; }
  .title { font-weight:700; font-size:20px; letter-spacing:.2px; unicode-bidi:isolate; }
  .sub { font-size:12.5px; color:var(--zc-mut); margin-top:2px; display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
  .dot { width:8px; height:8px; border-radius:50%; background:var(--zc-green); box-shadow:0 0 8px var(--zc-green); display:inline-block; }
  .dot.off { background:var(--zc-mut); box-shadow:none; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; min-height:26px; }
  .chip { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:999px; font-size:12.5px; font-weight:500;
    background:var(--zc-pan2); color:var(--zc-fg); cursor:pointer; border:1px solid var(--zc-brd); white-space:nowrap; }
  .chip ha-icon { --mdc-icon-size:15px; }
  .chip.ok { color:var(--zc-green); background:color-mix(in srgb, var(--zc-green) 12%, transparent); border-color:color-mix(in srgb, var(--zc-green) 30%, transparent); }
  .chip.bad { color:#fff; background:var(--zc-red); border-color:transparent; }
  .chip.warn { color:#1b1300; background:var(--zc-amber); border-color:transparent; }
  .stage { position:relative; touch-action:pan-y; user-select:none; -webkit-user-select:none; cursor:grab; margin-top:4px;
    aspect-ratio: 900/470; }
  .stage.drag { cursor:grabbing; }
  .stage::before { content:''; position:absolute; inset:8% 6% 4%; background:radial-gradient(ellipse at 50% 60%, var(--zc-glow), transparent 68%); pointer-events:none; }
  .floor { position:absolute; left:12%; right:12%; bottom:3%; height:9%; border-radius:50%;
    background:radial-gradient(ellipse at center, var(--zc-shadow) 0%, transparent 70%); filter:blur(4px); pointer-events:none; }
  .frames { position:absolute; inset:0; }
  .frames img { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; opacity:0; pointer-events:none; -webkit-user-drag:none; }
  .frames img.on { opacity:1; }
  .stage.studio { background:var(--zc-studio); border-radius:14px; overflow:hidden; }
  .stage.studio::before, .stage.studio .floor { display:none; }
  .stage.studio .hint { color:#5b6270; inset-inline-start:10px; bottom:8px; }
  .stage.static { cursor:pointer; touch-action:auto; }
  .ph { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:var(--zc-mut); opacity:.5; }
  .ph ha-icon { --mdc-icon-size:min(40cqi, 180px); }
  .hint { position:absolute; bottom:4px; inset-inline-start:0; font-size:11.5px; color:var(--zc-mut); display:flex; align-items:center; gap:4px;
    transition:opacity .6s; pointer-events:none; }
  .hint ha-icon { --mdc-icon-size:16px; }
  .hint.gone { opacity:0; }
  .loading { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:var(--zc-mut); font-size:12px; pointer-events:none; }
  .side { display:flex; flex-direction:column; gap:10px; min-width:0; }
  .tiles { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
  .tile { background:var(--zc-pan); border:1px solid var(--zc-brd); border-radius:12px; padding:10px 12px; cursor:pointer; min-width:0; }
  .tile.wide { grid-column:1 / -1; }
  .chg-btns { display:flex; align-items:center; gap:8px; margin-top:10px; }
  .chg-label { flex:none; display:inline-flex; flex-direction:column; align-items:center; justify-content:center;
    gap:1px; color:var(--zc-mut); font:500 10.5px var(--zc-font); line-height:1.2; text-align:center;
    pointer-events:none; user-select:none; }
  .chg-label ha-icon { --mdc-icon-size:14px; opacity:.8; margin-bottom:1px; }
  .chg-label-text { display:flex; flex-direction:column; align-items:center; white-space:nowrap; }
  .chg-btn { flex:1; min-width:0; border:1px solid var(--zc-brd); background:var(--zc-pan2); color:var(--zc-fg);
    font:600 13px var(--zc-font); padding:8px 10px; border-radius:10px; cursor:pointer;
    display:inline-flex; align-items:center; justify-content:center; gap:6px; touch-action:manipulation;
    transition:background .15s, transform .1s, opacity .15s; }
  .chg-btn ha-icon { --mdc-icon-size:16px; }
  .chg-btn:active:not([disabled]) { transform:scale(.97); }
  .chg-btn.start { color:var(--zc-teal); border-color:color-mix(in srgb, var(--zc-teal) 45%, transparent);
    background:color-mix(in srgb, var(--zc-teal) 14%, transparent); }
  .chg-btn.stop { color:var(--zc-red); border-color:color-mix(in srgb, var(--zc-red) 45%, transparent);
    background:color-mix(in srgb, var(--zc-red) 14%, transparent); }
  .chg-btn[disabled] { opacity:.4; pointer-events:none; cursor:not-allowed; }
  @container (max-width: 420px) {
    .chg-btns { gap:6px; }
    .chg-label { font-size:10px; }
    .chg-label ha-icon { --mdc-icon-size:13px; }
    .chg-btn { padding:8px 7px; font-size:12.5px; gap:4px; }
  }
  .lbl { font-size:12px; color:var(--zc-mut); display:flex; align-items:center; gap:5px; }
  .lbl ha-icon { --mdc-icon-size:15px; }
  .big { font-size:22px; font-weight:700; line-height:1.15; }
  .big small { font-size:13px; font-weight:500; color:var(--zc-mut); margin-inline-start:3px; }
  .bat { display:flex; align-items:center; gap:14px; }
  .ring { position:relative; width:74px; height:74px; flex:none; }
  .ring svg { width:100%; height:100%; transform:rotate(-90deg); }
  .ring .pct { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:17px; direction:ltr; }
  .bar { height:6px; border-radius:999px; background:var(--zc-pan2); overflow:hidden; margin-top:7px; }
  .bar > i { display:block; height:100%; border-radius:999px; }
  .temps { display:flex; gap:14px; }
  .temps > div { flex:1; min-width:0; }
  .tires { display:grid; grid-template-columns:1fr 34px 1fr; grid-template-rows:auto auto; gap:4px 8px; align-items:center; direction:ltr; margin-top:6px; }
  .tires .car { grid-column:2; grid-row:1 / span 2; height:58px; border-radius:12px 12px 10px 10px; border:2px solid var(--zc-pan2); position:relative; }
  .tires .car::before { content:''; position:absolute; left:4px; right:4px; top:9px; height:9px; border-radius:4px 4px 2px 2px; background:var(--zc-pan2); }
  .tp { font-weight:600; font-size:15px; text-align:center; padding:3px 0; border-radius:8px; background:var(--zc-pan); }
  .tp small { font-size:10.5px; color:var(--zc-mut); font-weight:400; margin-inline-start:2px; }
  .tp.low { background:var(--zc-red); color:#fff; } .tp.low small { color:#fff; }
  .acts { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:8px; }
  .act { background:var(--zc-pan); border:1px solid var(--zc-brd); border-radius:12px; padding:9px 4px 7px; cursor:pointer; color:var(--zc-fg);
    display:flex; flex-direction:column; align-items:center; gap:4px; font:500 11.5px var(--zc-font); transition:background .15s, transform .1s; }
  .act:active { transform:scale(.96); }
  .act ha-icon { --mdc-icon-size:22px; color:var(--zc-mut); }
  .act.on { background:color-mix(in srgb, var(--c, var(--zc-blue)) 16%, transparent); border-color:color-mix(in srgb, var(--c, var(--zc-blue)) 40%, transparent); }
  .act.on ha-icon { color:var(--c, var(--zc-blue)); }
  .act[disabled] { opacity:.4; pointer-events:none; }
  .stats { display:flex; flex-wrap:wrap; gap:6px 16px; font-size:12px; color:var(--zc-mut); padding:0 2px; }
  .stats b { color:var(--zc-fg); font-weight:600; }
  .more { display:flex; align-items:center; justify-content:center; gap:4px; background:none; border:none; color:var(--zc-mut); cursor:pointer;
    font:500 12.5px var(--zc-font); padding:4px; width:100%; }
  .more ha-icon { --mdc-icon-size:18px; transition:transform .2s; }
  .more.open ha-icon { transform:rotate(180deg); }
  .det { display:none; flex-direction:column; gap:8px; background:var(--zc-pan); border:1px solid var(--zc-brd); border-radius:12px; padding:10px 12px; }
  .det.open { display:flex; }
  .row { display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:30px; }
  .row .k { font-size:13px; display:flex; align-items:center; gap:6px; cursor:pointer; }
  .row .k ha-icon { --mdc-icon-size:18px; color:var(--zc-mut); }
  .seg { display:inline-flex; background:var(--zc-pan2); border-radius:999px; padding:2px; gap:2px; }
  .seg button, .btn { border:none; background:none; color:var(--zc-fg); font:500 12px var(--zc-font); padding:4px 10px; border-radius:999px; cursor:pointer; }
  .seg button.sel { background:var(--c, var(--zc-amber)); color:#1b1300; }
  .btn { background:var(--zc-pan2); }
  .btn.sel { background:var(--zc-blue); color:#fff; }
  .muted { color:var(--zc-mut); font-size:12px; }
  .upd .fresh { display:inline-flex; align-items:center; gap:4px; white-space:nowrap; }
  .upd .fresh.stale { color:var(--zc-amber); }
  .upd .fresh ha-icon { --mdc-icon-size:15px; }
  .eta { margin-top:2px; }
  .modal { position:absolute; inset:0; background:rgba(0,0,0,.55); display:none; align-items:center; justify-content:center; z-index:20; backdrop-filter:blur(2px); }
  .modal.show { display:flex; }
  .map-modal { position:absolute; inset:0; background:rgba(0,0,0,.55); display:none; align-items:center; justify-content:center; z-index:15; backdrop-filter:blur(2px); padding:10px; box-sizing:border-box; }
  .map-modal.show { display:flex; }
  .map-sheet { background:var(--card-background-color, #1c2230); color:var(--primary-text-color, var(--zc-fg));
    border-radius:16px; width:min(520px, 100%); max-height:100%; display:flex; flex-direction:column; overflow:hidden;
    box-shadow:0 10px 40px rgba(0,0,0,.5); }
  ha-card.light .map-sheet { background:#fff; color:#1b2230; }
  .map-head { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 14px 8px; }
  .map-head h2 { margin:0; font-size:17px; font-weight:700; letter-spacing:.2px; }
  .map-close { border:none; background:var(--zc-pan2); color:inherit; width:36px; height:36px; border-radius:10px; cursor:pointer;
    font:700 18px var(--zc-font); line-height:1; flex:none; }
  .map-canvas { height:min(42vh, 280px); min-height:180px; background:var(--zc-pan2); position:relative; }
  .map-canvas iframe, .map-canvas > * { width:100%; height:100%; border:0; display:block; }
  .map-canvas .map-empty { display:flex; align-items:center; justify-content:center; height:100%; padding:16px; text-align:center; color:var(--zc-mut); font-size:14px; }
  .map-meta { padding:10px 14px 4px; }
  .map-zone { font-weight:600; font-size:14.5px; }
  .map-updated { margin-top:2px; }
  .map-acts { display:flex; flex-wrap:wrap; gap:8px; padding:10px 14px 14px; }
  .map-btn { flex:1 1 30%; min-width:88px; text-align:center; text-decoration:none; border:none; border-radius:10px; padding:9px 8px;
    font:600 13px var(--zc-font); cursor:pointer; color:inherit; background:var(--zc-pan2); display:inline-flex; align-items:center;
    justify-content:center; gap:5px; box-sizing:border-box; }
  .map-btn ha-icon { --mdc-icon-size:16px; }
  a.map-btn { color:inherit; }
  .map-btn.nav { background:color-mix(in srgb, var(--zc-blue) 16%, transparent); color:var(--zc-blue); }
  .map-btn.waze { background:color-mix(in srgb, var(--zc-teal) 16%, transparent); color:var(--zc-teal); }
  .map-btn.honk { background:color-mix(in srgb, var(--zc-amber) 16%, transparent); color:var(--zc-amber); }
  .map-btn[disabled], .map-btn.is-off { opacity:.4; pointer-events:none; cursor:not-allowed; }
  .map-btn.hidden { display:none; }
  @container (max-width: 420px) {
    .map-canvas { height:min(38vh, 240px); min-height:160px; }
    .map-btn { font-size:12.5px; padding:8px 6px; }
  }
  .pc-modal { position:absolute; inset:0; background:rgba(0,0,0,.55); display:none; align-items:center; justify-content:center; z-index:15; backdrop-filter:blur(2px); padding:10px; box-sizing:border-box; }
  .pc-modal.show { display:flex; }
  .pc-sheet { background:var(--card-background-color, #1c2230); color:var(--primary-text-color, var(--zc-fg));
    border-radius:16px; width:min(440px, 100%); max-height:100%; display:flex; flex-direction:column; overflow:hidden;
    box-shadow:0 10px 40px rgba(0,0,0,.5); }
  ha-card.light .pc-sheet { background:#fff; color:#1b2230; }
  .pc-head { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 14px 8px; }
  .pc-head h2 { margin:0; font-size:17px; font-weight:700; letter-spacing:.2px; }
  .pc-body { overflow:auto; padding:2px 14px 8px; display:flex; flex-direction:column; gap:12px; -webkit-overflow-scrolling:touch; }
  .pc-k { font-size:12px; font-weight:600; color:var(--zc-mut); }
  .pc-step { display:flex; align-items:center; justify-content:center; gap:14px; }
  .pc-step button { width:40px; height:40px; border:none; border-radius:12px; background:var(--zc-pan2); color:inherit;
    font:700 20px var(--zc-font); cursor:pointer; line-height:1; }
  .pc-step button[disabled] { opacity:.35; pointer-events:none; }
  .pc-temp { font-size:28px; font-weight:700; min-width:4.2ch; text-align:center; font-variant-numeric:tabular-nums; }
  .pc-chips, .pc-presets { display:flex; flex-wrap:wrap; gap:6px; }
  .pc-chip { border:none; background:var(--zc-pan2); color:inherit; font:600 12.5px var(--zc-font); padding:7px 12px;
    border-radius:999px; cursor:pointer; }
  .pc-chip.sel { background:var(--zc-blue); color:#fff; }
  .pc-chip.cool.sel { background:var(--zc-teal); }
  .pc-chip.heat.sel { background:var(--zc-amber); color:#1b1300; }
  .pc-row { display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:34px; }
  .pc-row .lab { font-size:13px; display:flex; align-items:center; gap:6px; }
  .pc-row .lab ha-icon { --mdc-icon-size:18px; color:var(--zc-mut); }
  .pc-tog { width:46px; height:28px; border:none; border-radius:999px; background:var(--zc-pan2); cursor:pointer; position:relative; padding:0; flex:none; }
  .pc-tog::after { content:''; position:absolute; top:3px; inset-inline-start:3px; width:22px; height:22px; border-radius:50%; background:#fff; transition:inset-inline-start .15s, background .15s; }
  .pc-tog.on { background:var(--zc-blue); }
  .pc-tog.on::after { inset-inline-start:21px; }
  .pc-pair { display:flex; flex-direction:column; gap:6px; }
  .pc-who { font-size:11.5px; color:var(--zc-mut); min-width:3.5em; }
  .pc-segrow { display:flex; align-items:center; gap:8px; }
  .pc-note { font-size:11.5px; color:var(--zc-mut); line-height:1.35; }
  .pc-timewrap { display:flex; align-items:center; gap:6px; flex:1 1 auto; justify-content:flex-end; direction:ltr; unicode-bidi:isolate; }
  .pc-time-sel { border:none; border-radius:10px; background:var(--zc-pan2); color:inherit;
    font:600 14px var(--zc-font); padding:8px 6px; min-width:3.6em; text-align:center; }
  .pc-time-colon { font:700 16px var(--zc-font); opacity:.7; }
  .pc-time-text { font:600 13px var(--zc-font); color:var(--zc-mut); }
  .pc-status { font-size:12.5px; padding:0 14px 8px; color:var(--zc-mut); }
  .pc-status.ok { color:var(--zc-teal); }
  .pc-status.err { color:var(--zc-red); }
  .pc-foot { display:flex; flex-wrap:wrap; gap:8px; padding:10px 14px 14px; }
  .pc-btn { flex:1 1 30%; min-width:96px; text-align:center; border:none; border-radius:10px; padding:10px 8px;
    font:600 13px var(--zc-font); cursor:pointer; color:inherit; background:var(--zc-pan2); }
  .pc-btn.now { background:var(--zc-blue); color:#fff; }
  .pc-btn.stop { background:color-mix(in srgb, var(--zc-red) 18%, transparent); color:var(--zc-red); }
  .pc-btn.hidden { display:none; }
  .pc-btn[disabled] { opacity:.45; pointer-events:none; cursor:default; }
  .pc-sheet.pc-busy .pc-chip, .pc-sheet.pc-busy .pc-tog, .pc-sheet.pc-busy .seg button,
  .pc-sheet.pc-busy .pc-step button, .pc-sheet.pc-busy .pc-time-sel { opacity:.45; pointer-events:none; }
  @container (max-width: 420px) {
    .pc-temp { font-size:24px; }
    .pc-btn { font-size:12.5px; padding:9px 6px; }
  }
  .box { background:var(--card-background-color, #1c2230); color:var(--primary-text-color, #e8eef8); border-radius:16px; padding:18px; width:min(320px, 86%); box-shadow:0 10px 40px rgba(0,0,0,.5); text-align:center; }
  ha-card.light .box { background:#fff; color:#1b2230; }
  .box p { margin:4px 0 16px; font-size:15px; line-height:1.4; }
  .box .b2 { display:flex; gap:10px; justify-content:center; }
  .box button { flex:1; border:none; border-radius:10px; padding:9px; font:600 14px var(--zc-font); cursor:pointer; }
  .box .yes { background:var(--zc-red); color:#fff; } .box .no { background:var(--zc-pan2); color:inherit; }
  .toast { position:absolute; left:50%; bottom:14px; transform:translate(-50%,20px); opacity:0; background:rgba(12,16,26,.88); color:#fff; padding:6px 14px;
    border-radius:999px; font-size:12.5px; transition:all .25s; pointer-events:none; z-index:11; white-space:nowrap; }
  .toast.show { opacity:1; transform:translate(-50%,0); }
</style>
<ha-card>
  <div class="main">
    <div class="left">
      <div class="head"><div><div class="title"></div><div class="sub"></div></div><div class="upd muted"></div></div>
      <div class="chips"></div>
      <div class="stage"><div class="floor"></div><div class="frames">${imgs}</div><div class="loading"></div>
        <div class="hint"><ha-icon icon="mdi:rotate-360"></ha-icon><span></span></div></div>
    </div>
    <div class="side">
      <div class="tiles"></div>
      <div class="acts"></div>
      <div class="stats"></div>
      <button class="more"><span></span><ha-icon icon="mdi:chevron-down"></ha-icon></button>
      <div class="det"></div>
    </div>
  </div>
  <div class="map-modal" part="map-modal">
    <div class="map-sheet" role="dialog" aria-modal="true">
      <div class="map-head"><h2 class="map-title"></h2><button type="button" class="map-close" data-act="map_close" aria-label="">×</button></div>
      <div class="map-canvas"></div>
      <div class="map-meta"><div class="map-zone"></div><div class="map-updated muted"></div></div>
      <div class="map-acts">
        <a class="map-btn nav" target="_blank" rel="noopener noreferrer"><ha-icon icon="mdi:google-maps"></ha-icon><span></span></a>
        <a class="map-btn waze" target="_blank" rel="noopener noreferrer"><ha-icon icon="mdi:waze"></ha-icon><span></span></a>
        <button type="button" class="map-btn honk" data-act="map_honk"><ha-icon icon="mdi:bullhorn"></ha-icon><span></span></button>
      </div>
    </div>
  </div>
  <div class="pc-modal" part="pc-modal">
    <div class="pc-sheet" role="dialog" aria-modal="true">
      <div class="pc-head"><h2 class="pc-title"></h2><button type="button" class="map-close pc-close" data-act="pc_close" aria-label="">×</button></div>
      <div class="pc-body"></div>
      <div class="pc-status" hidden></div>
      <div class="pc-foot"></div>
    </div>
  </div>
  <div class="modal"><div class="box"><p></p><div class="b2"><button class="yes"></button><button class="no"></button></div></div></div>
  <div class="toast"></div>
</ha-card>`;
    const $ = (s) => root.querySelector(s);
    this._card = $('ha-card');
    this._el = { title: $('.title'), sub: $('.sub'), upd: $('.upd'), chips: $('.chips'), tiles: $('.tiles'), acts: $('.acts'),
      stats: $('.stats'), det: $('.det'), more: $('.more'), modal: $('.modal'), toast: $('.toast'), stage: $('.stage'),
      hint: $('.hint'), loading: $('.loading'), yes: $('.modal .yes'), no: $('.modal .no'),
      mmap: $('.map-modal'), mapTitle: $('.map-title'), mapClose: $('.map-close'), mapCanvas: $('.map-canvas'),
      mapZone: $('.map-zone'), mapUpdated: $('.map-updated'), mapNav: $('.map-btn.nav'), mapWaze: $('.map-btn.waze'), mapHonk: $('.map-btn.honk'),
      pcmodal: $('.pc-modal'), pcTitle: $('.pc-title'), pcClose: $('.pc-close'), pcBody: $('.pc-body'),
      pcStatus: $('.pc-status'), pcFoot: $('.pc-foot') };
    this._applyStatic();
    this._imgs = [...root.querySelectorAll('.frames img')];
    if (!this._imgs.length) this._el.loading.remove();
    const firstImg = this._imgs.find((im) => im.hasAttribute('src'));
    if (firstImg) {
      const done = () => {
        if (this._el.loading) this._el.loading.remove();
        this._loadRestFrames();
      };
      if (firstImg.complete && firstImg.naturalWidth > 0) done();
      else {
        firstImg.addEventListener('load', done, { once: true });
        firstImg.addEventListener('error', done, { once: true });
      }
      // Never hold the other frames back for long, even if the first one is slow.
      clearTimeout(this._restTimer);
      this._restTimer = setTimeout(() => this._loadRestFrames(), 2500);
    }
    const st = this._el.stage;
    if (P.studio) { st.classList.add('studio'); st.style.setProperty('--zc-studio', P.studio); }
    if (N > 1) { this._showFrame(); this._setupDrag(); }
    else {
      st.classList.add('static'); this._el.hint.remove();
      if (N === 1) { this._imgs[0] && this._imgs[0].classList.add('on'); this._cur = 0; }
      st.addEventListener('click', () => this._more(this._id('device_tracker', 'location')));
    }
    this._el.more.addEventListener('click', () => {
      this._detOpen = !this._detOpen;
      this._el.more.classList.toggle('open', this._detOpen); this._el.det.classList.toggle('open', this._detOpen);
    });
    root.addEventListener('click', (ev) => this._onClick(ev));
    this._el.no.addEventListener('click', () => this._closeModal());
    this._el.yes.addEventListener('click', () => { const fn = this._pending; this._closeModal(); if (fn) fn(); });
    this._el.modal.addEventListener('click', (e) => { if (e.target === this._el.modal) this._closeModal(); });
    this._el.mmap.addEventListener('click', (e) => { if (e.target === this._el.mmap) this._closeMap(); });
    this._el.pcmodal.addEventListener('click', (e) => { if (e.target === this._el.pcmodal) this._closePrecond(); });
  }

  _applyStatic() {
    const rtl = this._lang === 'he';
    this._card.setAttribute('dir', rtl ? 'rtl' : 'ltr');
    this._card.setAttribute('lang', this._lang);
    this._el.loading.textContent = this._t('loading');
    this._el.hint.querySelector('span').textContent = this._t('drag');
    this._el.more.querySelector('span').textContent = this._t('details');
    this._el.yes.textContent = this._t('yes');
    this._el.no.textContent = this._t('no');
    this._sig = null;
  }

  /* ---------- rotation ---------- */
  _loadRestFrames() {
    if (!this._imgs || this._restLoaded) return;
    this._restLoaded = true;
    clearTimeout(this._restTimer); this._restTimer = null;
    const go = () => { for (const im of this._imgs) this._ensureSrc(im); };
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') window.requestIdleCallback(go, { timeout: 1000 });
    else setTimeout(go, 0);
  }
  _ensureSrc(im) {
    if (im && !im.getAttribute('src') && im.dataset.src) { im.setAttribute('src', im.dataset.src); im.removeAttribute('data-src'); }
  }
  _showFrame() {
    const N = this._prof.frames;
    const f = ((Math.round(this._pos) % N) + N) % N;
    if (f === this._cur) return;
    this._ensureSrc(this._imgs[f]);
    if (this._cur != null && this._imgs[this._cur]) this._imgs[this._cur].classList.remove('on');
    this._imgs[f] && this._imgs[f].classList.add('on');
    this._cur = f;
  }
  _setupDrag() {
    const st = this._el.stage;
    let id = null, x0 = 0, p0 = 0, lastX = 0, lastT = 0, vel = 0, moved = false;
    const step = () => Math.max(10, st.clientWidth / 34);
    st.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button > 0) return;
      cancelAnimationFrame(this._raf);
      id = e.pointerId; x0 = lastX = e.clientX; lastT = e.timeStamp; p0 = this._pos; vel = 0; moved = false;
    });
    st.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - x0;
      if (!moved && Math.abs(dx) > 6) { moved = true; st.classList.add('drag'); try { st.setPointerCapture(id); } catch (_) {} this._el.hint.classList.add('gone'); }
      if (!moved) return;
      this._pos = p0 - this._prof.direction * dx / step();
      const dt = Math.max(1, e.timeStamp - lastT);
      vel = 0.7 * vel + 0.3 * (-this._prof.direction * (e.clientX - lastX) / step() / dt);
      lastX = e.clientX; lastT = e.timeStamp;
      this._showFrame();
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null; st.classList.remove('drag');
      if (!moved) { if (e.type === 'pointerup') this._more(this._id('device_tracker', 'location')); return; }
      let v = Math.max(-0.05, Math.min(0.05, vel)); let t = performance.now();
      const tick = (now) => {
        const dt = now - t; t = now; this._pos += v * dt; v *= Math.pow(0.992, dt);
        this._showFrame();
        if (Math.abs(v) > 0.0006) this._raf = requestAnimationFrame(tick);
        else { this._pos = Math.round(this._pos); this._showFrame(); }
      };
      this._raf = requestAnimationFrame(tick);
    };
    st.addEventListener('pointerup', end);
    st.addEventListener('pointercancel', end);
  }

  /* ---------- actions ---------- */
  _more(entityId) {
    if (!entityId || !this._s(entityId)) return;
    const ev = new Event('hass-more-info', { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }
  /* ---------- command gate ---------- */
  _isCarCall(domain, data) {
    if (!data || !data.entity_id || !this._cfg) return false;
    const ids = Array.isArray(data.entity_id) ? data.entity_id : [data.entity_id];
    const p = `.${this._cfg.prefix}_`, clim = this._climateId();
    // Refresh Data reads the car rather than commanding it, so it is never held back.
    return ids.some((id) => (String(id).includes(p) || id === clim) && id !== this._id('button', 'refresh_data'));
  }
  _isNoop(domain, service, data) {
    const id = data && typeof data.entity_id === 'string' ? data.entity_id : null;
    const s = id && this._s(id);
    if (!s) return false;
    const st = String(s.state);
    if (domain === 'switch' && service === 'turn_on') return st === 'on';
    if (domain === 'switch' && service === 'turn_off') return st === 'off';
    if (domain === 'select' && service === 'select_option') return st === String(data.option);
    if (domain === 'lock' && service === 'lock') return st === 'locked';
    if (domain === 'lock' && service === 'unlock') return st === 'unlocked';
    if (domain === 'cover' && service === 'open_cover') return st === 'open';
    if (domain === 'cover' && service === 'close_cover') return st === 'closed' && !((s.attributes && s.attributes.current_position) > 0);
    return false;
  }
  _gateRun(task, car) {
    const g = GEC_gate(this._cfg.prefix);
    const gap = Math.round(Number(this._cfg.command_cooldown || 0) * 1000);
    g.pending++;
    const run = async () => {
      try {
        if (car && gap > 0) {
          const wait = g.last + gap - Date.now();
          if (wait > 0) await this._pcDelay(wait);
        }
        return await task();
      } finally {
        if (car) g.last = Date.now();
        g.pending--;
      }
    };
    const p = g.tail.then(run, run);
    g.tail = p.catch(() => {});
    return p;
  }
  _gateBusy(car) {
    const g = GEC_gate(this._cfg.prefix);
    const gap = Math.round(Number(this._cfg.command_cooldown || 0) * 1000);
    return g.pending > 0 || (car && gap > 0 && Date.now() - g.last < gap);
  }
  _svc(domain, service, data, msgKey) {
    if (this._isNoop(domain, service, data)) { this._toast(this._t('t_noop')); return Promise.resolve(false); }
    const car = this._isCarCall(domain, data);
    if (this._gateBusy(car)) this._toast(this._t('t_queued'));
    const gap = Math.max(1000, Math.round(Number(this._cfg.command_cooldown || 0) * 1000));
    return this._gateRun(async () => {
      let err = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await this._hass.callService(domain, service, data);
          this._toast(this._t(msgKey || 't_sent'));
          return true;
        } catch (e) {
          err = e;
          if (!car || attempt === 1 || !this._pcIsBusyErr(e)) break;
          await this._pcDelay(gap);
        }
      }
      this._toast(this._t('t_err', { m: (err && err.message) || this._t('t_failed') }));
      return false;
    }, car);
  }
  _confirm(text, fn) { this._pending = fn; this._el.modal.querySelector('p').textContent = text; this._el.modal.classList.add('show'); }
  _closeModal() { this._pending = null; this._el.modal.classList.remove('show'); }
  _toast(t) {
    const el = this._el.toast; el.textContent = t; el.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => el.classList.remove('show'), 2200);
  }
  _onClick(ev) {
    for (const n of ev.composedPath()) {
      if (!n.dataset) continue;
      if (n.dataset.act) { ev.stopPropagation(); return this._act(n.dataset.act, n.dataset); }
      if (n.dataset.more) return this._more(n.dataset.more);
      if (n === this._card) return;
    }
  }
  _act(a, d) {
    const lock = this._id('lock', 'doors'), chg = this._id('switch', 'charging'), clim = this._climateId();
    switch (a) {
      case 'lock':
        if (this._v(lock) === 'locked') this._confirm(this._t('c_unlock'), () => this._svc('lock', 'unlock', { entity_id: lock }, 't_unlock'));
        else this._svc('lock', 'lock', { entity_id: lock }, 't_lock');
        break;
      case 'climate': {
        const s = this._s(clim); if (!s) return;
        this._openPrecond();
        break;
      }
      case 'pc_close': this._closePrecond(); break;
      case 'pc_temp_up': this._pcNudge(0.5); break;
      case 'pc_temp_down': this._pcNudge(-0.5); break;
      case 'pc_mode': this._pcSetMode(d.mode); break;
      case 'pc_sw': this._pcToggle(d.key); break;
      case 'pc_sel': this._pcSetSel(d.key, d.opt); break;
      case 'pc_xsw': this._pcToggleExtra(d.ent); break;
      case 'pc_xsel': this._pcSetExtra(d.ent, d.opt); break;
      case 'pc_quick': this._pcQuick(d.quick); break;
      case 'pc_now': this._pcStartNow(); break;
      case 'pc_at': this._pcStartAt(); break;
      case 'pc_stop': this._pcStop(); break;
      case 'charge': {
        const on = this._on(chg);
        this._confirm(this._t(on ? 'c_stop' : 'c_start'), () => this._svc('switch', on ? 'turn_off' : 'turn_on', { entity_id: chg }, on ? 't_stop' : 't_start'));
        break;
      }
      case 'charge_start': this._chargeAct(true); break;
      case 'charge_stop': this._chargeAct(false); break;
      case 'find':
        if (this._findAction() === 'map' && this._locationId()) this._openMap();
        else this._svc('button', 'press', { entity_id: this._id('button', 'find_car') }, 't_find');
        break;
      case 'map_close': this._closeMap(); break;
      case 'map_honk': this._honkFromMap(); break;
      case 'refresh': this._svc('button', 'press', { entity_id: this._id('button', 'refresh_data') }, 't_refresh'); break;
      case 'press': this._confirm(this._t('c_' + d.key), () => this._svc('button', 'press', { entity_id: d.ent })); break;
      case 'select': this._svc('select', 'select_option', { entity_id: d.ent, option: d.opt }, 't_updated'); break;
      case 'switch': this._svc('switch', this._on(d.ent) ? 'turn_off' : 'turn_on', { entity_id: d.ent }); break;
      case 'cover': {
        const go = () => this._svc('cover', d.dir === 'open' ? 'open_cover' : 'close_cover', { entity_id: d.ent });
        if (d.dir === 'open') this._confirm(this._t('c_open_' + d.key), go); else go();
        break;
      }
    }
  }


  _locationId() {
    if (this._cfg.location) return this._cfg.location;
    const id = this._id('device_tracker', 'location');
    return this._s(id) ? id : null;
  }
  _findAction() {
    if (this._cfg.find_action) return this._cfg.find_action;
    return this._locationId() ? 'map' : 'honk';
  }
  _locCoords(s) {
    const lat = s && Number(s.attributes && s.attributes.latitude);
    const lon = s && Number(s.attributes && s.attributes.longitude);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    return { lat, lon };
  }
  _locZoneText(s) {
    if (!s) return this._t('loc_unavailable');
    const st = String(s.state || '');
    if (st === 'home') return this._t('home');
    if (st === 'not_home') return this._t('away');
    if (GEC_BAD.includes(st.toLowerCase())) return this._t('loc_unavailable');
    return st;
  }
  _onEscKey = (e) => {
    if (e.key !== 'Escape') return;
    if (this._el.modal.classList.contains('show')) { this._closeModal(); e.preventDefault(); return; }
    if (this._el.pcmodal && this._el.pcmodal.classList.contains('show')) { this._closePrecond(); e.preventDefault(); return; }
    if (this._el.mmap.classList.contains('show')) { this._closeMap(); e.preventDefault(); }
  }
  _openMap() {
    const locId = this._locationId();
    const s = this._s(locId);
    const coords = this._locCoords(s);
    const E = this._el;
    E.mapTitle.textContent = this._t('find_map_title');
    E.mapClose.setAttribute('aria-label', this._t('find_close'));
    E.mapNav.querySelector('span').textContent = this._t('find_navigate');
    E.mapWaze.querySelector('span').textContent = this._t('find_waze');
    E.mapHonk.querySelector('span').textContent = this._t('find_honk');
    E.mapZone.textContent = this._locZoneText(s);
    const upd = s && this._rel(s.last_updated || s.last_changed);
    E.mapUpdated.textContent = upd ? this._t('updated', { t: upd }) : '';
    const honkId = this._id('button', 'find_car');
    E.mapHonk.classList.toggle('hidden', !this._s(honkId));
    if (coords) {
      const dest = `${coords.lat.toFixed(6)},${coords.lon.toFixed(6)}`;
      E.mapNav.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
      E.mapWaze.href = `https://waze.com/ul?ll=${encodeURIComponent(dest)}&navigate=yes`;
      E.mapNav.classList.remove('is-off');
      E.mapWaze.classList.remove('is-off');
      E.mapNav.removeAttribute('aria-disabled');
      E.mapWaze.removeAttribute('aria-disabled');
    } else {
      E.mapNav.removeAttribute('href');
      E.mapWaze.removeAttribute('href');
      E.mapNav.classList.add('is-off');
      E.mapWaze.classList.add('is-off');
      E.mapNav.setAttribute('aria-disabled', 'true');
      E.mapWaze.setAttribute('aria-disabled', 'true');
    }
    this._closePrecond();
    E.mmap.classList.add('show');
    this._syncEsc();
    this._fillMap(E.mapCanvas, locId, coords);
  }
  _closeMap() {
    this._clearCarMarker();
    if (this._el && this._el.mmap) this._el.mmap.classList.remove('show');
    if (this._el && this._el.mapCanvas) this._el.mapCanvas.innerHTML = '';
    this._syncEsc();
  }
  _syncEsc() {
    const need = !!(this._el && (
      (this._el.mmap && this._el.mmap.classList.contains('show')) ||
      (this._el.pcmodal && this._el.pcmodal.classList.contains('show'))
    ));
    if (need && !this._escBound) { document.addEventListener('keydown', this._onEscKey); this._escBound = true; }
    if (!need && this._escBound) { document.removeEventListener('keydown', this._onEscKey); this._escBound = false; }
  }
  _honkFromMap() {
    const id = this._id('button', 'find_car');
    if (!this._s(id)) return;
    this._confirm(this._t('c_honk'), () => this._svc('button', 'press', { entity_id: id }, 't_find'));
  }
  _fillMap(canvas, locId, coords) {
    canvas.innerHTML = '';
    if (!coords) {
      const empty = document.createElement('div');
      empty.className = 'map-empty';
      empty.textContent = this._t('loc_unavailable');
      canvas.appendChild(empty);
      return;
    }
    const fallback = () => {
      canvas.innerHTML = '';
      const dLat = 0.006, dLon = 0.008;
      const bbox = `${coords.lon - dLon},${coords.lat - dLat},${coords.lon + dLon},${coords.lat + dLat}`;
      const marker = `${coords.lat},${coords.lon}`;
      const iframe = document.createElement('iframe');
      iframe.title = this._t('find_map_title');
      iframe.referrerPolicy = 'no-referrer';
      iframe.setAttribute('loading', 'lazy');
      iframe.src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(marker)}`;
      canvas.appendChild(iframe);
    };
    const loader = (typeof window !== 'undefined' && window.loadCardHelpers) ? window.loadCardHelpers : null;
    if (typeof loader !== 'function') { fallback(); return; }
    Promise.resolve().then(() => loader()).then((h) => {
      if (!this._el.mmap.classList.contains('show')) return;
      const card = h.createCardElement({ type: 'map', entities: [locId], default_zoom: 16, hours_to_show: 0, theme_mode: 'auto' });
      card.hass = this._hass;
      canvas.innerHTML = '';
      canvas.appendChild(card);
      this._hookCarMarker(card, coords);
    }).catch(() => fallback());
  }

  /* ---------- car map marker ---------- */
  _onFrameError(im) {
    if (this._cdnTried || !this._shouldAutoCdn()) return;
    if (String(im && im.getAttribute('data-f')) !== '0') return;
    this._cdnTried = true;
    this._forceCdn = true;
    this._prof = null;
    console.info('geely-3d-card: local frames not found; using Geely-hosted images (image_source: geely). Download a copy with scripts/fetch-images.sh for offline use.');
    Promise.resolve().then(() => {
      this._built = false;
      this._cur = null;
      this._restLoaded = false;
      if (this.shadowRoot) this.shadowRoot.innerHTML = '';
      if (this._hass) this.hass = this._hass;
    });
  }
  _mapMarkerSrc() {
    const P = this._profile();
    if (P.single) return P.single;
    if (!P.cdn && !P.base) return null;
    const frames = Math.max(Number(P.frames) || 0, 1);
    let frame = Number(this._cfg.map_marker_frame);
    if (!Number.isInteger(frame) || frame < 1) frame = Number(P.start) || 1;
    frame = Math.min(Math.max(frame, 1), frames);
    return this._frameSrc(frame) || null;
  }
  _makeCarPin() {
    const src = this._mapMarkerSrc();
    if (!src) return null;
    const P = this._profile();
    const w = 72;
    const studio = !!P.studio;
    const h = studio ? 62 : 52;
    const wrap = document.createElement('div');
    wrap.className = 'gec-pin' + (studio ? ' studio' : '');
    wrap.style.cssText = 'width:72px;display:flex;flex-direction:column;align-items:center;line-height:0;'
      + 'filter:drop-shadow(0 2px 4px rgba(0,0,0,.45));pointer-events:none;box-sizing:border-box;'
      + (studio ? 'background:#fff;border-radius:12px;padding:4px 4px 0;' : '');
    if (studio && P.studio && P.studio !== 'transparent') wrap.style.background = P.studio;
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    if (P.cdn) img.referrerPolicy = 'no-referrer';
    img.src = src;
    img.style.cssText = 'width:72px;height:auto;max-height:40px;max-width:72px;display:block;object-fit:contain;pointer-events:none';
    const tip = document.createElement('i');
    tip.className = 'gec-pin-tip';
    const tipColor = studio ? (P.studio && P.studio !== 'transparent' ? P.studio : '#fff') : '#243044';
    tip.style.cssText = 'width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;'
      + `border-top:9px solid ${tipColor};display:block;margin-top:-1px;align-self:center`;
    wrap.append(img, tip);
    return { el: wrap, size: [w, h], anchor: [w / 2, h] };
  }
  _findHaMap(root) {
    const walk = (node, d) => {
      if (!node || d > 10) return null;
      if (node.tagName === 'HA-MAP') return node;
      const sr = node.shadowRoot;
      if (sr) {
        const direct = sr.querySelector('ha-map');
        if (direct) return direct;
        for (const child of sr.querySelectorAll('*')) {
          const found = walk(child, d + 1);
          if (found) return found;
        }
      }
      return null;
    };
    return walk(root, 0);
  }
  _leafletFrom(haMap) {
    if (haMap.leafletMap && haMap.Leaflet) return { map: haMap.leafletMap, L: haMap.Leaflet };
    const eng = haMap._engine;
    if (eng && eng.leafletMap && (eng.Leaflet || (typeof window !== 'undefined' && window.L))) {
      return { map: eng.leafletMap, L: eng.Leaflet || window.L };
    }
    return null;
  }
  _haMapReady(card) {
    if (!card) return false;
    const tag = String(card.tagName || '');
    return !!(card.shadowRoot || tag === 'HUI-MAP-CARD' || /MAP-CARD$/.test(tag) || (card.querySelector && card.querySelector('ha-map')));
  }
  _hookCarMarker(card, coords) {
    this._clearCarMarker();
    if (!coords || !this._cfg || this._cfg.map_marker !== 'car') return;
    if (!this._haMapReady(card) && !(card && card.shadowRoot)) {
      // Plain mock / non-map host: do not spin for 2s
      if (!card || (!card.shadowRoot && String(card.tagName || '') === 'DIV')) return;
    }
    if (!this._haMapReady(card)) return;
    const pin = this._makeCarPin();
    if (!pin) return;
    const started = Date.now();
    const tryHook = () => {
      this._mapHookTimer = null;
      if (!this._el || !this._el.mmap || !this._el.mmap.classList.contains('show')) return;
      const haMap = this._findHaMap(card);
      const engine = haMap && haMap._engine && typeof haMap._engine.addMarker === 'function' ? haMap._engine : null;
      const leaf = haMap ? this._leafletFrom(haMap) : null;
      if (engine || leaf) { this._placeCarMarker(haMap, engine, leaf, pin, coords); return; }
      if (Date.now() - started >= 2000) return;
      this._mapHookTimer = setTimeout(tryHook, 100);
    };
    tryHook();
  }
  _placeCarMarker(haMap, engine, leaf, pin, coords) {
    this._hideDefaultMarkers(haMap);
    const latlng = [coords.lat, coords.lon];
    if (engine) {
      try {
        this._mapMarkerHandle = engine.addMarker(pin.el, latlng, {
          size: pin.size, anchor: pin.anchor, interactive: false, focusable: false,
          raised: true, cluster: false, nativeTitle: false,
        });
        this._mapMarkerKind = 'engine';
        return;
      } catch (err) { /* try Leaflet */ }
    }
    if (leaf && leaf.L && leaf.map && leaf.L.divIcon && leaf.L.marker) {
      const icon = leaf.L.divIcon({ html: pin.el, iconSize: pin.size, iconAnchor: pin.anchor, className: 'gec-pin-icon' });
      this._mapMarkerHandle = leaf.L.marker(latlng, { icon, keyboard: false, interactive: false, zIndexOffset: 1000 }).addTo(leaf.map);
      this._mapMarkerKind = 'leaflet';
    }
  }
  _hideDefaultMarkers(haMap) {
    const root = haMap && haMap.shadowRoot;
    if (!root || root.querySelector('style[data-gec-hide-markers]')) return;
    const st = document.createElement('style');
    st.setAttribute('data-gec-hide-markers', '');
    st.textContent = 'ha-entity-marker{opacity:0!important;pointer-events:none!important}';
    root.appendChild(st);
  }
  _updateCarMarker() {
    if (!this._el || !this._el.mmap || !this._el.mmap.classList.contains('show') || !this._mapMarkerHandle) return;
    const coords = this._locCoords(this._s(this._locationId()));
    if (!coords) return;
    const h = this._mapMarkerHandle;
    const latlng = [coords.lat, coords.lon];
    try {
      if (typeof h.setLocation === 'function') h.setLocation(latlng);
      else if (h.marker && typeof h.marker.setLatLng === 'function') h.marker.setLatLng(latlng);
      else if (typeof h.setLatLng === 'function') h.setLatLng(latlng);
    } catch (err) { /* leave the last position */ }
  }
  _clearCarMarker() {
    if (this._mapHookTimer) { clearTimeout(this._mapHookTimer); this._mapHookTimer = null; }
    const h = this._mapMarkerHandle;
    this._mapMarkerHandle = null;
    this._mapMarkerKind = null;
    if (!h) return;
    try {
      if (typeof h.remove === 'function') h.remove();
    } catch (err) { /* already gone */ }
  }


  /* ---------- pre-conditioning ---------- */
  _pcCanSchedule() { return !!(this._cfg.precond_schedule && this._cfg.precond_enabled); }
  _pcSuffixes() {
    return {
      df: { domain: 'switch', key: 'defrost' },
      wh: { domain: 'switch', key: 'steering_wheel_heat' },
      wv: { domain: 'switch', key: 'window_ventilation' },
      shd: { domain: 'select', key: 'seat_heat_driver' },
      shp: { domain: 'select', key: 'seat_heat_passenger' },
      svd: { domain: 'select', key: 'seat_vent_driver' },
      svp: { domain: 'select', key: 'seat_vent_passenger' },
    };
  }
  _pcIds() {
    const suf = this._pcSuffixes();
    const ids = {};
    for (const [k, s] of Object.entries(suf)) ids[k] = this._id(s.domain, s.key);
    const extras = [];
    for (const id of (this._cfg.precond_entities || [])) {
      let hit = null;
      for (const [k, s] of Object.entries(suf)) {
        if (id === ids[k] || id.endsWith(`_${s.key}`)) { hit = k; break; }
      }
      if (hit) { ids[hit] = id; continue; }
      if (this._s(id)) extras.push(id);
    }
    const out = { extras };
    for (const [k, id] of Object.entries(ids)) out[k] = this._s(id) ? id : null;
    return out;
  }
  _pcMinMax() {
    const s = this._s(this._climateId()), a = (s && s.attributes) || {};
    let min = Number(a.min_temp), max = Number(a.max_temp);
    if (!isFinite(min)) min = 15.5;
    if (!isFinite(max)) max = 28.5;
    if (min > max) { const t = min; min = max; max = t; }
    return { min, max };
  }
  _pcClamp(t) {
    const { min, max } = this._pcMinMax();
    const n = Math.round(Number(t) * 2) / 2;
    return Math.min(max, Math.max(min, isFinite(n) ? n : 22));
  }
  _pcPresets() {
    const s = this._s(this._climateId());
    const modes = (s && s.attributes && s.attributes.preset_modes) || [];
    return modes.filter((m) => m && String(m).toLowerCase() !== 'none');
  }
  _pcFindPreset(want) {
    const w = String(want || '').toLowerCase();
    return this._pcPresets().find((m) => String(m).toLowerCase() === w) || null;
  }
  _pcSelOptions(id) {
    const s = this._s(id);
    const opts = (s && s.attributes && s.attributes.options) || ['Off', 'Low', 'Medium', 'High'];
    return opts.filter((o) => o != null && String(o) !== '');
  }
  _pcOffOption(id) {
    const opts = this._pcSelOptions(id);
    return opts.find((o) => String(o).toLowerCase() === 'off') || opts[0] || 'Off';
  }
  _pcOptLabel(opt) {
    const k = `opt_${String(opt || '').toLowerCase()}`;
    const t = this._t(k);
    return t === k ? String(opt) : t;
  }
  _pcDefaultTemp() {
    const s = this._s(this._climateId()), a = (s && s.attributes) || {};
    const cur = Number(a.temperature ?? a.target_temp ?? a.target_temperature);
    return this._pcClamp(isFinite(cur) ? cur : 22);
  }
  _pcInitState() {
    const ids = this._pcIds();
    const st = { t: this._pcDefaultTemp(), p: null, df: false, wh: false, wv: false, extra: {}, time: '07:00' };
    for (const k of ['df', 'wh', 'wv']) st[k] = !!(ids[k] && this._on(ids[k]));
    for (const k of ['shd', 'shp', 'svd', 'svp']) {
      const id = ids[k];
      st[k] = id ? (this._v(id) || this._pcOffOption(id)) : this._pcOffOption(id);
    }
    for (const id of ids.extras) {
      const domain = id.split('.')[0];
      if (domain === 'switch') st.extra[id] = this._on(id);
      else st.extra[id] = this._v(id) || this._pcOffOption(id);
    }
    st.time = this._pcDefaultTime();
    if (this._on(this._cfg.precond_enabled)) {
      const settings = this._v(this._cfg.precond_settings);
      if (settings) {
        const parsed = this._pcParse(settings);
        if (parsed) Object.assign(st, parsed.partial);
      }
    }
    this._pc = st;
  }
  _pcParse(raw) {
    let o;
    try { o = JSON.parse(String(raw)); } catch { return null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    const ids = this._pcIds();
    const partial = { extra: { ...(this._pc && this._pc.extra) || {} } };
    if (o.t != null) partial.t = this._pcClamp(o.t);
    if (o.p) {
      const found = this._pcFindPreset(o.p);
      if (found) partial.p = found;
    } else if (o.p === '' || o.p === null) partial.p = null;
    for (const k of ['df', 'wh', 'wv']) if (o[k] != null && ids[k]) partial[k] = !!(o[k] && o[k] !== '0' && o[k] !== 0);
    for (const k of ['shd', 'shp', 'svd', 'svp']) {
      if (o[k] == null || !ids[k]) continue;
      const opt = String(o[k]);
      if (this._pcSelOptions(ids[k]).includes(opt)) partial[k] = opt;
    }
    if (Array.isArray(o.e)) {
      for (const row of o.e) {
        if (!Array.isArray(row) || row.length < 2) continue;
        const id = String(row[0]).toLowerCase();
        if (!entitySafe(id) || !ids.extras.includes(id)) continue;
        const domain = id.split('.')[0];
        if (domain === 'switch') partial.extra[id] = !!(row[1] && row[1] !== '0' && row[1] !== 0);
        else if (this._pcSelOptions(id).includes(String(row[1]))) partial.extra[id] = String(row[1]);
      }
    }
    function entitySafe(id) { return /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/.test(id); }
    return { partial };
  }
  _pcJson() {
    const st = this._pc, ids = this._pcIds(), o = { t: st.t };
    if (st.p) o.p = st.p;
    for (const k of ['df', 'wh', 'wv']) if (ids[k]) o[k] = st[k] ? 1 : 0;
    for (const k of ['shd', 'shp', 'svd', 'svp']) if (ids[k]) o[k] = st[k];
    const e = [];
    for (const id of ids.extras) {
      const v = st.extra[id];
      e.push([id, typeof v === 'boolean' ? (v ? 1 : 0) : v]);
    }
    if (e.length) o.e = e;
    return JSON.stringify(o);
  }
  _pcSetMode(mode) {
    if (!this._pc) return;
    if (!mode || mode === 'auto') this._pc.p = null;
    else this._pc.p = this._pcFindPreset(mode) || null;
    this._paintPrecond();
  }
  _pcNudge(d) {
    if (!this._pc) return;
    this._pc.t = this._pcClamp(this._pc.t + d);
    this._paintPrecond();
  }
  _pcToggle(key) {
    if (!this._pc || !(key in this._pc)) return;
    this._pc[key] = !this._pc[key];
    this._paintPrecond();
  }
  _pcSetSel(key, opt) {
    if (!this._pc || !key) return;
    this._pc[key] = String(opt);
    this._paintPrecond();
  }
  _pcToggleExtra(ent) {
    if (!this._pc || !ent) return;
    this._pc.extra[ent] = !this._pc.extra[ent];
    this._paintPrecond();
  }
  _pcSetExtra(ent, opt) {
    if (!this._pc || !ent) return;
    this._pc.extra[ent] = String(opt);
    this._paintPrecond();
  }
  _pcQuick(which) {
    if (!this._pc) return;
    const ids = this._pcIds();
    const mid = (id) => {
      if (!id) return null;
      const opts = this._pcSelOptions(id);
      return opts.find((o) => String(o).toLowerCase() === 'medium') || opts[Math.min(1, opts.length - 1)] || 'Medium';
    };
    const off = (id) => this._pcOffOption(id);
    if (which === 'cool') {
      this._pc.t = this._pcClamp(20);
      this._pc.p = this._pcFindPreset('Rapid Cooling');
      this._pc.df = false; this._pc.wh = false;
      if (ids.svd) this._pc.svd = mid(ids.svd);
      if (ids.svp) this._pc.svp = mid(ids.svp);
      if (ids.shd) this._pc.shd = off(ids.shd);
      if (ids.shp) this._pc.shp = off(ids.shp);
    } else if (which === 'heat') {
      this._pc.t = this._pcClamp(25);
      this._pc.p = this._pcFindPreset('Rapid Warming');
      if (ids.df) this._pc.df = true;
      if (ids.wh) this._pc.wh = true;
      if (ids.shd) this._pc.shd = mid(ids.shd);
      if (ids.shp) this._pc.shp = mid(ids.shp);
      if (ids.svd) this._pc.svd = off(ids.svd);
      if (ids.svp) this._pc.svp = off(ids.svp);
    }
    this._paintPrecond();
  }
  _use24h() {
    const cfg = this._cfg && this._cfg.time_format;
    if (cfg === '24h') return true;
    if (cfg === '12h') return false;
    if (this._lang === 'he') return true;
    const tf = String((this._hass && this._hass.locale && this._hass.locale.time_format) || '').toLowerCase();
    if (tf === '24' || tf === '24h') return true;
    if (tf === 'am_pm' || tf === '12' || tf === '12h') return false;
    try {
      const hc = new Intl.DateTimeFormat(this._locale, { hour: 'numeric' }).resolvedOptions().hourCycle;
      return hc === 'h23' || hc === 'h24';
    } catch (e) { return this._lang === 'he'; }
  }
  _etaClock(iso) {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (!isFinite(t) || t < Date.now() - 5 * 60000) return null;
    const h = this._hass;
    const tz = h && h.locale && h.locale.time_zone === 'server' && h.config && h.config.time_zone ? h.config.time_zone : undefined;
    try {
      const parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).formatToParts(new Date(t));
      const get = (k) => (parts.find((p) => p.type === k) || {}).value || '00';
      return this._fmtClock(`${get('hour')}:${get('minute')}`);
    } catch (e) { return null; }
  }
  _fmtClock(hhmm) {
    const m = String(hhmm || '').match(/(\d{1,2}):(\d{2})/);
    if (!m) return '';
    const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
    const pad = (n) => String(n).padStart(2, '0');
    if (this._use24h()) return `${pad(h)}:${pad(min)}`;
    const h12 = h % 12 || 12;
    return `${h12}:${pad(min)} ${h < 12 ? 'AM' : 'PM'}`;
  }
  _pcSnapTime(hhmm) {
    const m = String(hhmm || '').match(/(\d{1,2}):(\d{2})/);
    if (!m) return '07:30';
    let h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    let min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
    min = Math.round(min / 5) * 5;
    if (min >= 60) { min = 0; h = (h + 1) % 24; }
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  _pcDefaultTime() {
    if (this._on(this._cfg.precond_enabled)) {
      const raw = this._v(this._cfg.precond_schedule) || '';
      const m = String(raw).match(/(\d{1,2}):(\d{2})/);
      if (m) return this._pcSnapTime(`${m[1].padStart(2, '0')}:${m[2]}`);
    }
    try {
      const now = new Date();
      const h = (now.getHours() + 2) % 24;
      return `${String(h).padStart(2, '0')}:00`;
    } catch (e) { return '07:30'; }
  }
  _pcReadTime() {
    const body = this._el && this._el.pcBody;
    const hh = body && body.querySelector('select[data-pc="hh"]');
    const mm = body && body.querySelector('select[data-pc="mm"]');
    if (hh && mm) this._pc.time = this._pcSnapTime(`${hh.value}:${mm.value}`);
    return (this._pc && this._pc.time) || this._pcDefaultTime();
  }
  _openPrecond() {
    const clim = this._climateId();
    if (!this._s(clim)) return;
    this._closeMap();
    this._pcInitState();
    this._el.pcTitle.textContent = this._t('pc_title');
    this._el.pcClose.setAttribute('aria-label', this._t('find_close'));
    this._paintPrecond();
    this._el.pcmodal.classList.add('show');
    this._syncEsc();
  }
  _closePrecond() {
    if (this._el && this._el.pcmodal) this._el.pcmodal.classList.remove('show');
    this._syncEsc();
  }
  _paintPrecond() {
    if (!this._el || !this._el.pcBody || !this._pc) return;
    const esc = (t) => this._esc(t);
    const st = this._pc, ids = this._pcIds(), { min, max } = this._pcMinMax();
    const tempTxt = Number(st.t).toLocaleString(this._locale, { minimumFractionDigits: st.t % 1 ? 1 : 0, maximumFractionDigits: 1 });
    const chips = [`<button type="button" class="pc-chip ${st.p ? '' : 'sel'}" data-act="pc_mode" data-mode="auto">${esc(this._t('pc_auto'))}</button>`];
    for (const [want, key, cls] of [['Rapid Cooling', 'pc_rapid_cool', 'cool'], ['Rapid Warming', 'pc_rapid_warm', 'heat']]) {
      const mode = this._pcFindPreset(want); if (!mode) continue;
      chips.push(`<button type="button" class="pc-chip ${cls} ${st.p === mode ? 'sel' : ''}" data-act="pc_mode" data-mode="${esc(mode)}">${esc(this._t(key))}</button>`);
    }
    const tog = (key, id, label, icon) => {
      if (!id) return '';
      return `<div class="pc-row"><span class="lab"><ha-icon icon="${icon}"></ha-icon>${esc(label)}</span>
        <button type="button" class="pc-tog ${st[key] ? 'on' : ''}" data-act="pc_sw" data-key="${esc(key)}" aria-pressed="${st[key] ? 'true' : 'false'}"></button></div>`;
    };
    const segs = (aKey, bKey, aId, bId, title, icon) => {
      if (!aId && !bId) return '';
      const one = (key, id, who) => {
        if (!id) return '';
        const opts = this._pcSelOptions(id);
        return `<div class="pc-segrow"><span class="pc-who">${esc(this._t(who))}</span>
          <span class="seg" style="--c:var(--zc-blue)">${opts.map((o) =>
            `<button type="button" class="${st[key] === o ? 'sel' : ''}" data-act="pc_sel" data-key="${esc(key)}" data-opt="${esc(o)}">${esc(this._pcOptLabel(o))}</button>`
          ).join('')}</span></div>`;
      };
      return `<div class="pc-pair"><div class="pc-k"><ha-icon icon="${icon}" style="--mdc-icon-size:16px"></ha-icon> ${esc(title)}</div>${one(aKey, aId, 'pc_driver')}${one(bKey, bId, 'pc_passenger')}</div>`;
    };
    const extraRows = ids.extras.map((id) => {
      const s = this._s(id);
      const name = esc((s && s.attributes && s.attributes.friendly_name) || id.split('.')[1] || id);
      const domain = id.split('.')[0];
      if (domain === 'switch') {
        const on = !!st.extra[id];
        return `<div class="pc-row"><span class="lab">${name}</span>
          <button type="button" class="pc-tog ${on ? 'on' : ''}" data-act="pc_xsw" data-ent="${esc(id)}"></button></div>`;
      }
      const opts = this._pcSelOptions(id);
      return `<div class="pc-pair"><div class="pc-k">${name}</div><div class="pc-segrow"><span class="seg" style="--c:var(--zc-blue)">${opts.map((o) =>
        `<button type="button" class="${st.extra[id] === o ? 'sel' : ''}" data-act="pc_xsel" data-ent="${esc(id)}" data-opt="${esc(o)}">${esc(this._pcOptLabel(o))}</button>`
      ).join('')}</span></div></div>`;
    }).join('');
    const canAt = this._pcCanSchedule();
    this._el.pcBody.innerHTML = `
      <div class="pc-presets">
        <button type="button" class="pc-chip cool" data-act="pc_quick" data-quick="cool">${esc(this._t('pc_cool'))}</button>
        <button type="button" class="pc-chip heat" data-act="pc_quick" data-quick="heat">${esc(this._t('pc_heat'))}</button>
      </div>
      <div>
        <div class="pc-k">${esc(this._t('pc_temp'))}</div>
        <div class="pc-step">
          <button type="button" data-act="pc_temp_down" ${st.t <= min ? 'disabled' : ''} aria-label="-">−</button>
          <div class="pc-temp">${esc(tempTxt)}°</div>
          <button type="button" data-act="pc_temp_up" ${st.t >= max ? 'disabled' : ''} aria-label="+">+</button>
        </div>
      </div>
      <div class="pc-chips">${chips.join('')}</div>
      ${tog('df', ids.df, this._t('pc_defrost'), 'mdi:car-defrost-front')}
      ${tog('wh', ids.wh, this._t('pc_wheel'), 'mdi:steering')}
      ${segs('shd', 'shp', ids.shd, ids.shp, this._t('pc_seat_heat'), 'mdi:car-seat-heater')}
      ${segs('svd', 'svp', ids.svd, ids.svp, this._t('pc_seat_vent'), 'mdi:car-seat-cooler')}
      ${tog('wv', ids.wv, this._t('pc_winvent'), 'mdi:window-open')}
      ${extraRows}
      <div class="pc-note">${esc(this._t('pc_note'))}</div>
      ${canAt ? `<div class="pc-row"><span class="lab">${esc(this._t('pc_at'))}${this._fmtClock(st.time) ? ` ${this._clockText(st.time)}` : ''}</span>
        <span class="pc-timewrap" dir="ltr">${this._pcTimeSelects(st.time)}</span></div>` : ''}`;
    const clim = this._s(this._climateId());
    const climOn = !!(clim && clim.state && clim.state !== 'off' && !GEC_BAD.includes(String(clim.state).toLowerCase()));
    const busy = !!this._pcBusy;
    const dis = busy ? 'disabled' : '';
    const foot = [`<button type="button" class="pc-btn now" data-act="pc_now" ${dis}>${esc(this._t('pc_now'))}</button>`];
    if (canAt) foot.push(`<button type="button" class="pc-btn" data-act="pc_at" ${dis}>${esc(this._t('pc_at'))}</button>`);
    if (climOn) foot.push(`<button type="button" class="pc-btn stop" data-act="pc_stop" ${dis}>${esc(this._t('pc_stop'))}</button>`);
    this._el.pcFoot.innerHTML = foot.join('');
    const sheet = this._el.pcmodal && this._el.pcmodal.querySelector('.pc-sheet');
    if (sheet) sheet.classList.toggle('pc-busy', busy);
    if (this._el.pcStatus && this._pcStatus) {
      this._el.pcStatus.hidden = false;
      this._el.pcStatus.className = 'pc-status' + (this._pcStatus.kind ? ` ${this._pcStatus.kind}` : '');
      this._el.pcStatus.textContent = this._pcStatus.text || '';
    }
    this._el.pcBody.querySelectorAll('select[data-pc]').forEach((sel) => {
      sel.addEventListener('change', () => {
        this._pcReadTime();
        const lab = this._el.pcBody.querySelector('.pc-time-text');
        if (lab) lab.textContent = this._fmtClock(this._pc.time);
      });
    });
  }
  _clockText(hhmm) {
    const t = this._fmtClock(hhmm);
    return t ? `<bdi class="pc-time-text" dir="ltr">${this._esc(t)}</bdi>` : '';
  }
  _pcTimeSelects(hhmm) {
    const t = this._pcSnapTime(hhmm);
    const [h, m] = t.split(':');
    const esc = (x) => this._esc(x);
    const hours = [];
    for (let i = 0; i < 24; i++) {
      const v = String(i).padStart(2, '0');
      hours.push(`<option value="${v}" ${v === h ? 'selected' : ''}>${v}</option>`);
    }
    const mins = [];
    for (let i = 0; i < 60; i += 5) {
      const v = String(i).padStart(2, '0');
      mins.push(`<option value="${v}" ${v === m ? 'selected' : ''}>${v}</option>`);
    }
    return `<select class="pc-time-sel" data-pc="hh" aria-label="${esc(this._t('pc_hour'))}">${hours.join('')}</select>`
      + `<span class="pc-time-colon">:</span>`
      + `<select class="pc-time-sel" data-pc="mm" aria-label="${esc(this._t('pc_minute'))}">${mins.join('')}</select>`;
  }
  _pcEntityLabel(id, fallbackKey) {
    const s = this._s(id);
    const name = s && s.attributes && s.attributes.friendly_name;
    if (name) return String(name);
    return fallbackKey ? this._t(fallbackKey) : (id || this._t('pc_title'));
  }
  _pcSwitchSkip(id, wantOn) {
    const s = this._s(id);
    const st = s ? String(s.state).toLowerCase() : '';
    if (!s || GEC_BAD.includes(st)) return !wantOn;
    return wantOn ? st === 'on' : st === 'off';
  }
  _pcSelectSkip(id, want) {
    const cur = this._v(id);
    return cur != null && String(cur) === String(want);
  }
  _pcCalls() {
    const st = this._pc, ids = this._pcIds(), clim = this._climateId(), out = [];
    const labels = { df: 'pc_defrost', wh: 'pc_wheel', wv: 'pc_winvent', shd: 'pc_seat_heat', shp: 'pc_seat_heat', svd: 'pc_seat_vent', svp: 'pc_seat_vent' };
    out.push(['climate', 'set_temperature', { entity_id: clim, temperature: st.t, hvac_mode: 'heat_cool' }, this._t('pc_temp')]);
    if (st.p) {
      const s = this._s(clim);
      const cur = s && s.attributes && s.attributes.preset_mode;
      if (String(cur || '') !== String(st.p)) {
        out.push(['climate', 'set_preset_mode', { entity_id: clim, preset_mode: st.p }, st.p]);
      }
    }
    for (const k of ['df', 'wh', 'wv']) {
      if (!ids[k] || this._pcSwitchSkip(ids[k], !!st[k])) continue;
      out.push(['switch', st[k] ? 'turn_on' : 'turn_off', { entity_id: ids[k] }, this._pcEntityLabel(ids[k], labels[k])]);
    }
    for (const k of ['shd', 'shp', 'svd', 'svp']) {
      if (!ids[k] || st[k] == null || this._pcSelectSkip(ids[k], st[k])) continue;
      out.push(['select', 'select_option', { entity_id: ids[k], option: st[k] }, this._pcEntityLabel(ids[k], labels[k])]);
    }
    for (const id of ids.extras) {
      const domain = id.split('.')[0], v = st.extra[id];
      const lab = this._pcEntityLabel(id);
      if (domain === 'switch') {
        if (this._pcSwitchSkip(id, !!v)) continue;
        out.push(['switch', v ? 'turn_on' : 'turn_off', { entity_id: id }, lab]);
      } else if (v != null) {
        if (this._pcSelectSkip(id, v)) continue;
        out.push(['select', 'select_option', { entity_id: id, option: v }, lab]);
      }
    }
    return out;
  }
  _pcStopCalls() {
    const ids = this._pcIds(), clim = this._climateId(), out = [];
    const climS = this._s(clim);
    const climOn = !!(climS && climS.state && climS.state !== 'off' && !GEC_BAD.includes(String(climS.state).toLowerCase()));
    if (climOn) out.push(['climate', 'set_hvac_mode', { entity_id: clim, hvac_mode: 'off' }, this._t('pc_stop')]);
    const labels = { df: 'pc_defrost', wh: 'pc_wheel', wv: 'pc_winvent', shd: 'pc_seat_heat', shp: 'pc_seat_heat', svd: 'pc_seat_vent', svp: 'pc_seat_vent' };
    for (const k of ['df', 'wh', 'wv']) {
      if (ids[k] && this._on(ids[k])) out.push(['switch', 'turn_off', { entity_id: ids[k] }, this._pcEntityLabel(ids[k], labels[k])]);
    }
    for (const k of ['shd', 'shp', 'svd', 'svp']) {
      if (!ids[k]) continue;
      const off = this._pcOffOption(ids[k]);
      const cur = this._v(ids[k]);
      if (cur != null && String(cur) !== String(off)) {
        out.push(['select', 'select_option', { entity_id: ids[k], option: off }, this._pcEntityLabel(ids[k], labels[k])]);
      }
    }
    for (const id of ids.extras) {
      const domain = id.split('.')[0];
      if (domain === 'switch') {
        if (this._on(id)) out.push(['switch', 'turn_off', { entity_id: id }, this._pcEntityLabel(id)]);
      } else {
        const off = this._pcOffOption(id);
        const cur = this._v(id);
        if (cur != null && String(cur) !== String(off)) {
          out.push(['select', 'select_option', { entity_id: id, option: off }, this._pcEntityLabel(id)]);
        }
      }
    }
    return out;
  }
  _pcIsBusyErr(err) {
    const m = String((err && (err.message || err.error || err)) || '').toLowerCase();
    return m.includes('not yet been executed') || m.includes('send the command later') || /\b8070\b/.test(m);
  }
  _pcDelay(ms) {
    if (!ms || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  _pcCallService(domain, service, data) {
    const fn = this._hass.callService.bind(this._hass);
    try { return fn(domain, service, data, undefined, false); }
    catch (e) { return Promise.reject(e); }
  }
  async _pcCallOne(call) {
    const [d, s, data, label] = call;
    const zero = !this._cfg.command_delay;
    const backoffs = zero ? [0, 0, 0] : [3000, 6000, 10000];
    let lastErr = null;
    for (let attempt = 0; attempt <= 3; attempt++) {
      try {
        await this._pcCallService(d, s, data);
        return { ok: true };
      } catch (err) {
        lastErr = err;
        if (!this._pcIsBusyErr(err) || attempt === 3) break;
        await this._pcDelay(backoffs[attempt]);
      }
    }
    return { ok: false, err: lastErr, label: label || s };
  }
  _pcSetProgress(n, total) {
    const el = this._el && this._el.pcStatus;
    if (!el) return;
    el.hidden = false;
    el.className = 'pc-status';
    el.textContent = this._t('pc_sending', { n, t: total });
    const sheet = this._el.pcmodal && this._el.pcmodal.querySelector('.pc-sheet');
    if (sheet) sheet.classList.add('pc-busy');
    if (this._el.pcFoot) this._el.pcFoot.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  }
  _pcRun(calls, msgKey) {
    if (this._pcBusy) return Promise.resolve();
    if (!calls.length) { this._toast(this._t(msgKey)); this._closePrecond(); return Promise.resolve(); }
    const car = calls.some((c) => c[0] === 'climate' || c[0] === 'switch' || c[0] === 'select');
    this._pcBusy = true;
    // The whole sequence holds the car's command queue, so a tap elsewhere waits for it.
    return this._gateRun(() => this._pcRunSeq(calls, msgKey), car);
  }
  async _pcRunSeq(calls, msgKey) {
    this._pcStatus = { kind: '', text: this._t('pc_sending', { n: 1, t: calls.length }) };
    this._pcSetProgress(1, calls.length);
    const failed = [];
    const gap = Math.round(Number(this._cfg.command_delay || 0) * 1000);
    const carDomain = (d) => d === 'climate' || d === 'switch' || d === 'select';
    try {
      for (let i = 0; i < calls.length; i++) {
        this._pcSetProgress(i + 1, calls.length);
        const res = await this._pcCallOne(calls[i]);
        if (!res.ok) failed.push(res);
        if (i < calls.length - 1 && gap > 0 && carDomain(calls[i][0]) && carDomain(calls[i + 1][0])) {
          await this._pcDelay(gap);
        }
      }
    } finally {
      this._pcBusy = false;
    }
    if (!failed.length) {
      this._pcStatus = { kind: 'ok', text: this._t(msgKey) };
      this._toast(this._t(msgKey));
      this._closePrecond();
    } else {
      const items = failed.map((f) => f.label).join(', ');
      const msg = this._t('pc_some_failed', { items });
      this._pcStatus = { kind: 'err', text: msg };
      this._toast(msg);
      const sheet = this._el && this._el.pcmodal && this._el.pcmodal.querySelector('.pc-sheet');
      if (sheet) sheet.classList.remove('pc-busy');
      this._paintPrecond();
    }
  }
  _pcStartNow() {
    if (!this._pc || !this._s(this._climateId())) return;
    this._confirm(this._t('c_precond'), () => this._pcRun(this._pcCalls(), 't_clim_on'));
  }
  _pcStop() {
    if (!this._s(this._climateId())) return;
    this._pcRun(this._pcStopCalls(), 't_clim_off');
  }
  _pcStartAt() {
    if (!this._pcCanSchedule() || !this._pc) return;
    const time = this._pcReadTime();
    const m = String(time).match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return;
    const hhmm = `${m[1].padStart(2, '0')}:${m[2]}`;
    const json = this._pcJson();
    if (this._cfg.precond_settings && json.length > 255) { this._toast(this._t('t_pc_json')); return; }
    const calls = [
      ['input_datetime', 'set_datetime', { entity_id: this._cfg.precond_schedule, time: `${hhmm}:00` }],
      ['input_boolean', 'turn_on', { entity_id: this._cfg.precond_enabled }],
    ];
    if (this._cfg.precond_settings) calls.push(['input_text', 'set_value', { entity_id: this._cfg.precond_settings, value: json }]);
    this._pcRun(calls, 't_pc_sched');
  }

  _chargeStartId() { return this._cfg.charge_start || this._cfg.charger_switch || null; }
  _chargeStopId() { return this._cfg.charge_stop || this._cfg.charger_switch || null; }
  _entOk(id) {
    const s = this._s(id);
    return !!(s && String(s.state).toLowerCase() !== 'unavailable');
  }
  _chargeAct(start) {
    const id = start ? this._chargeStartId() : this._chargeStopId();
    if (!this._entOk(id)) { this._toast(this._t('unavailable')); return; }
    this._confirm(this._t(start ? 'c_start' : 'c_stop'), () => this._callCharge(id, start));
  }
  _callCharge(id, start) {
    const domain = String(id).split('.')[0];
    const msg = start ? 't_start' : 't_stop';
    const data = { entity_id: id };
    if (domain === 'button' || domain === 'input_button') this._svc(domain, 'press', data, msg);
    else if (domain === 'switch') this._svc('switch', start ? 'turn_on' : 'turn_off', data, msg);
    else if (domain === 'script') this._svc('script', 'turn_on', data, msg);
    else this._toast(this._t('t_err', { m: domain || this._t('t_failed') }));
  }
  _chgButtonsHtml() {
    const startId = this._chargeStartId(), stopId = this._chargeStopId();
    if (!startId && !stopId) return '';
    const btn = (act, cls, icon, label, id) => {
      const ok = this._entOk(id);
      const dis = ok ? '' : 'disabled';
      const title = ok ? '' : ` title="${this._esc(this._t('unavailable'))}"`;
      return `<button type="button" class="chg-btn ${cls}" data-act="${this._esc(act)}" ${dis}${title}><ha-icon icon="${this._esc(icon)}"></ha-icon><span>${this._esc(label)}</span></button>`;
    };
    const label = `<span class="chg-label"><ha-icon icon="mdi:ev-station"></ha-icon><span class="chg-label-text"><span>${this._esc(this._t('charger_ctrl_1'))}</span><span>${this._esc(this._t('charger_ctrl_2'))}</span></span></span>`;
    return `<div class="chg-btns">${label}${btn('charge_start', 'start', 'mdi:power-plug', this._t('start_charge'), startId)}${btn('charge_stop', 'stop', 'mdi:power-plug-off', this._t('stop_charge'), stopId)}</div>`;
  }

  /* ---------- render ---------- */
  _render() {
    const E = this._el, T = (k, v) => this._t(k, v), I = (k) => this._id('sensor', k), B = (k) => this._id('binary_sensor', k);
    const esc = (t) => this._esc(t);
    const clim = this._climateId();
    // header
    E.title.textContent = this._cfg.title || this._profile().name;
    const trk = this._s(this._id('device_tracker', 'location'));
    const loc = !trk ? null : trk.state === 'home' ? T('home') : trk.state === 'not_home' ? T('away') : GEC_BAD.includes(trk.state) ? null : trk.state;
    const connected = this._on(B('connected'));
    const eng = (this._v(I('engine_state')) || '').toLowerCase();
    const sub = [`<span class="dot ${connected ? '' : 'off'}"></span>${T(connected ? 'connected' : 'disconnected')}`];
    if (loc) sub.push(`<span data-more="${esc(trk.entity_id)}" style="cursor:pointer">· ${esc(loc)}</span>`);
    if (eng === 'on' || eng === 'running') sub.push('· ' + T('engine_on'));
    else if (eng) sub.push('· ' + T('parked'));
    E.sub.innerHTML = sub.join(' ');
    // Freshness: the car's own report time (Car Reported At). Last Updated is only the integration's
    // poll clock and moves on every poll even when the car has said nothing for hours.
    const repIso = this._v(I('car_reported_at')), syncIso = this._v(I('last_updated'));
    const freshIso = repIso || syncIso;
    const freshT = freshIso ? Date.parse(freshIso) : NaN;
    const stale = isFinite(freshT) && this._cfg.stale_minutes > 0 && (Date.now() - freshT) > this._cfg.stale_minutes * 60000;
    if (isFinite(freshT)) {
      const rel = this._rel(freshIso), syncRel = this._rel(syncIso);
      const label = repIso ? T('reported', { t: rel }) : T('updated', { t: rel });
      const title = repIso && syncRel ? T('synced', { t: syncRel }) : '';
      const moreId = repIso ? I('car_reported_at') : I('last_updated');
      E.upd.innerHTML = `<span class="fresh${stale ? ' stale' : ''}" data-more="${esc(moreId)}" style="cursor:pointer" title="${esc(title)}">`
        + (stale ? `<ha-icon icon="mdi:clock-alert-outline"></ha-icon><b>${esc(T('stale'))}</b> · ` : '')
        + `${esc(label)}</span>`;
    } else E.upd.innerHTML = '';

    // chips
    const chips = [];
    const lockId = this._id('lock', 'doors'), lockS = this._v(lockId);
    if (lockS === 'locked') chips.push(`<span class="chip ok" data-more="${esc(lockId)}"><ha-icon icon="mdi:lock"></ha-icon>${T('locked')}</span>`);
    else if (lockS) chips.push(`<span class="chip bad" data-more="${esc(lockId)}"><ha-icon icon="mdi:lock-open-variant"></ha-icon>${lockS === 'unlocked' ? T('unlocked') : esc(lockS)}</span>`);
    const opens = [['door_driver', 'mdi:car-door'], ['door_passenger', 'mdi:car-door'], ['door_rear_left', 'mdi:car-door'],
      ['door_rear_right', 'mdi:car-door'], ['trunk', 'mdi:car-back'], ['hood', 'mdi:car-lifted-pickup']];
    const flap = this._first('binary_sensor', ['fuel_flap', 'tank_flap']);
    if (flap && this._on(flap)) chips.push(`<span class="chip bad" data-more="${esc(flap)}"><ha-icon icon="mdi:gas-station"></ha-icon>${T('fuel_flap')}</span>`);
    for (const [k, ic] of opens) if (this._on(B(k))) chips.push(`<span class="chip bad" data-more="${esc(B(k))}"><ha-icon icon="${ic}"></ha-icon>${T(k)}</span>`);
    for (const [k, key] of [['all_windows', 'windows_open'], ['sunroof', 'sunroof_open']]) {
      const s = this._s(this._id('cover', k));
      if (s && (s.state === 'open' || s.state === 'opening' || (s.attributes.current_position || 0) > 0))
        chips.push(`<span class="chip bad" data-more="${esc(s.entity_id)}"><ha-icon icon="mdi:window-open-variant"></ha-icon>${T(key)}</span>`);
    }
    let days = this._n(I('days_to_service'));
    const dist = this._n(I('distance_to_service'));
    const warnId = this._first('binary_sensor', ['service_warning', 'service_due', 'maintenance_warning']);
    const warn = warnId ? (this._v(warnId) == null ? null : this._on(warnId)) : null;
    // Some cars send 0 or 1 day as a placeholder while thousands of km remain (geely-connect #130).
    // Ignore such a day count unless the car's own service warning (if exposed) says it is due.
    if (days != null && days <= 1 && warn !== true && (warn === false || (dist != null && dist > this._cfg.service_km))) days = null;
    if (warn === true && (days == null || days > this._cfg.service_days) && (dist == null || dist > this._cfg.service_km)) {
      chips.push(`<span class="chip bad" data-more="${esc(warnId)}"><ha-icon icon="mdi:wrench"></ha-icon>${T('service_due')}</span>`);
    } else if (days != null && days <= this._cfg.service_days) {
      const t = days < 0 ? T('service_overdue') : days === 0 ? T('service_today') : days === 1 ? T('service_tomorrow') : T('service_days', { n: this._fmt(days) });
      chips.push(`<span class="chip ${days <= 0 ? 'bad' : 'warn'}" data-more="${esc(I('days_to_service'))}"><ha-icon icon="mdi:wrench"></ha-icon>${t}</span>`);
    } else if (dist != null && dist <= this._cfg.service_km) {
      chips.push(`<span class="chip warn" data-more="${esc(I('distance_to_service'))}"><ha-icon icon="mdi:wrench"></ha-icon>${T('service_km', { n: this._fmt(dist) })}</span>`);
    }
    E.chips.innerHTML = chips.join('');

    // tiles
    const bat = this._n(I('battery')), rng = this._n(I('electric_range')), full = this._n(I('range_at_full_charge'));
    const col = bat == null ? 'var(--zc-mut)' : bat > 50 ? 'var(--zc-green)' : bat > 20 ? 'var(--zc-amber)' : 'var(--zc-red)';
    const plugged = this._on(B('charger_plug'));
    const conn = (this._v(I('charger_connection')) || '').toLowerCase();
    const charging = this._on(this._id('switch', 'charging')) || (this._n(I('charging_power')) || 0) > 0.05;
    const showChg = plugged || charging || (conn && conn !== 'disconnected');
    const C = 2 * Math.PI * 31, frac = bat == null ? 0 : Math.max(0, Math.min(100, bat)) / 100;
    const tiles = [];
    const fuelPctId = this._first('sensor', ['fuel_level_percent', 'fuel_level_pct']);
    const fuelLId = this._first('sensor', ['fuel_level']);
    const fuelRngId = this._first('sensor', ['fuel_range']);
    const combId = this._first('sensor', ['combined_range']);
    const hasFuel = !!(fuelPctId || fuelLId || fuelRngId) && this._profile().drive !== 'bev';
    const comb = combId ? this._n(combId) : null;
    tiles.push(`<div class="tile wide" data-more="${esc(I('battery'))}"><div class="bat">
      <div class="ring"><svg viewBox="0 0 74 74"><circle cx="37" cy="37" r="31" fill="none" stroke="var(--zc-pan2)" stroke-width="7"/>
        <circle cx="37" cy="37" r="31" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}"/></svg>
        <div class="pct">${bat == null ? '—' : this._fmt(bat) + '%'}</div></div>
      <div style="flex:1;min-width:0"><div class="lbl"><ha-icon icon="${charging ? 'mdi:battery-charging' : 'mdi:battery'}"></ha-icon>${T('battery_range')}</div>
        <div class="big">${this._fmt(rng)}<small>${T('km')}</small></div>
        <div class="muted">${hasFuel ? (comb != null ? T('combined', { n: this._fmt(comb) }) : T('ev_range')) : full != null ? T('full_range', { n: this._fmt(full) }) : ''}</div>
        <div class="bar"><i style="width:${(frac * 100).toFixed(0)}%;background:${col}"></i></div></div></div></div>`);
    if (hasFuel) {
      const fpct = fuelPctId ? this._n(fuelPctId) : null, fl = fuelLId ? this._n(fuelLId) : null, fr = fuelRngId ? this._n(fuelRngId) : null;
      const fcol = fpct == null ? 'var(--zc-amber)' : fpct > 25 ? 'var(--zc-amber)' : 'var(--zc-red)';
      tiles.push(`<div class="tile wide" data-more="${esc(fuelRngId || fuelPctId || fuelLId)}">
        <div class="lbl"><ha-icon icon="mdi:gas-station"></ha-icon>${T('fuel')}</div>
        <div class="temps"><div><div class="big">${this._fmt(fr)}<small>${T('km')}</small></div><div class="muted">${T('fuel_range')}</div></div>
        <div><div class="big">${fpct != null ? this._fmt(fpct) + '%' : this._fmt(fl, 1) + `<small>${T('litres')}</small>`}</div><div class="muted">${fpct != null && fl != null ? this._fmt(fl, 1) + ' ' + T('litres') : ''}</div></div></div>
        ${fpct != null ? `<div class="bar"><i style="width:${Math.max(0, Math.min(100, fpct)).toFixed(0)}%;background:${fcol}"></i></div>` : ''}</div>`);
    }
    const chgBtns = this._chgButtonsHtml();
    if (showChg) {
      const pw = this._n(I('charging_power')), ttf = this._n(I('time_to_full_charge'));
      const charged = !charging && bat != null && bat >= 100;
      const ttfS = ttf == null ? '—' : ttf >= 60 ? `${Math.floor(ttf / 60)}:${String(Math.round(ttf % 60)).padStart(2, '0')} ${T('h')}` : `${this._fmt(ttf)} ${T('min')}`;
      const eta = charging ? this._etaClock(this._v(I('charge_complete'))) : null;
      const right = charged
        ? `<div class="big">${this._fmt(bat)}%</div><div class="muted">${T('plugged')}</div>`
        : `<div class="big"><bdi>${ttfS}</bdi></div><div class="muted">${T('to_full')}</div>`
          + (eta ? `<div class="muted eta" data-more="${esc(I('charge_complete'))}">${esc(T('eta', { t: '\u2068' + eta + '\u2069' }))}</div>` : '');
      tiles.push(`<div class="tile wide" data-more="${esc(I('charging_power'))}" style="border-color:color-mix(in srgb, var(--zc-teal) 45%, transparent)">
        <div class="lbl" style="color:var(--zc-teal)"><ha-icon icon="${charged ? 'mdi:battery-check' : 'mdi:ev-plug-type2'}"></ha-icon>${T(charging ? 'charging' : charged ? 'charged' : 'plugged')}</div>
        <div class="temps"><div><div class="big">${this._fmt(pw, 1)}<small>${T('kw')}</small></div><div class="muted">${T('power')}</div></div>
        <div>${right}</div></div>${chgBtns}</div>`);
    } else if (chgBtns) {
      tiles.push(`<div class="tile wide" style="border-color:color-mix(in srgb, var(--zc-mut) 45%, transparent)">
        <div class="lbl" style="color:var(--zc-mut)"><ha-icon icon="mdi:power-plug-off-outline"></ha-icon>${T('unplugged')}</div>${chgBtns}</div>`);
    }
    const tin = this._n(I('interior_temperature')), tout = this._n(I('exterior_temperature'));
    tiles.push(`<div class="tile" data-more="${esc(clim || I('interior_temperature'))}"><div class="lbl"><ha-icon icon="mdi:thermometer"></ha-icon>${T('temperature')}</div>
      <div class="temps"><div><div class="big">${this._fmt(tin, 1)}°</div><div class="muted">${T('cabin')}</div></div>
      <div><div class="big">${this._fmt(tout, 1)}°</div><div class="muted">${T('outside')}</div></div></div></div>`);
    const tcell = (k) => {
      const id = I('tire_pressure_' + k), b = this._tireBar(id);
      const low = b != null && b < this._cfg.low_bar;
      const shown = b == null ? '—' : this._fmt(this._tireFromBar(b), this._cfg.tire_unit === 'bar' ? 1 : 0);
      return `<div class="tp ${low ? 'low' : ''}" data-more="${esc(id)}">${shown}<small>${esc(this._tireUnitLabel())}</small></div>`; };
    tiles.push(`<div class="tile"><div class="lbl"><ha-icon icon="mdi:tire"></ha-icon>${T('tires')}</div>
      <div class="tires">${tcell('fl')}<div class="car"></div>${tcell('fr')}${tcell('rl')}${tcell('rr')}</div></div>`);
    E.tiles.innerHTML = tiles.join('');

    // actions
    const climS = this._s(clim);
    const climOn = climS && !['off', ...GEC_BAD].includes(climS.state);
    const chgS = this._s(this._id('switch', 'charging'));
    const chgOn = !!(chgS && chgS.state === 'on');
    const btn = (act, icon, label, on, color, ent) =>
      `<button class="act ${on ? 'on' : ''}" data-act="${act}" ${!this._s(ent) ? 'disabled' : ''} style="${color ? '--c:' + color : ''}"><ha-icon icon="${icon}"></ha-icon><span>${label}</span></button>`;
    E.acts.innerHTML = [
      btn('lock', lockS === 'locked' ? 'mdi:lock' : 'mdi:lock-open-variant', T(lockS === 'locked' ? 'unlock' : 'lock'), lockS !== 'locked' && !!lockS, 'var(--zc-red)', lockId),
      btn('climate', 'mdi:fan', T(climOn ? 'climate_off' : 'precond'), climOn, 'var(--zc-blue)', clim),
      btn('charge', 'mdi:ev-station', T(chgOn ? 'stop_charge' : 'start_charge'), chgOn, 'var(--zc-teal)', this._id('switch', 'charging')),
      btn('find', 'mdi:car-search', T('find'), false, null, (this._findAction() === 'map' && this._locationId()) ? this._locationId() : this._id('button', 'find_car')),
      btn('refresh', 'mdi:refresh', T('refresh'), false, null, this._id('button', 'refresh_data')),
    ].join('');

    // stats
    const stat = (k, label, unit, d = 0) => { const v = this._n(I(k)); return v == null ? '' : `<span data-more="${esc(I(k))}" style="cursor:pointer">${label} <b>${this._fmt(v, d)}</b> ${unit}</span>`; };
    E.stats.innerHTML = [stat('total_mileage', T('odometer'), T('km')), stat('distance_to_service', T('to_service'), T('km')),
      stat('average_consumption', T('consumption'), T('kwh100'), 1), stat('last_trip', T('last_trip'), T('km'), 1)].join('');

    // details
    const rows = [];
    const seg = (key, icon, color) => {
      const id = this._id('select', key), s = this._s(id); if (!s) return;
      const opts = s.attributes.options || [];
      rows.push(`<div class="row"><span class="k" data-more="${esc(id)}"><ha-icon icon="${icon}"></ha-icon>${T(key)}</span><span class="seg" style="--c:${color}">${
        opts.map((o) => { const lk = 'opt_' + String(o).toLowerCase(); const lbl = GEC_I18N.en[lk] ? T(lk) : o;
          return `<button class="${s.state === o ? 'sel' : ''}" data-act="select" data-ent="${esc(id)}" data-opt="${esc(o)}">${esc(lbl)}</button>`; }).join('')}</span></div>`);
    };
    seg('seat_heat_driver', 'mdi:car-seat-heater', 'var(--zc-amber)');
    seg('seat_heat_passenger', 'mdi:car-seat-heater', 'var(--zc-amber)');
    seg('seat_vent_driver', 'mdi:car-seat-cooler', 'var(--zc-blue)');
    seg('seat_vent_passenger', 'mdi:car-seat-cooler', 'var(--zc-blue)');
    seg('seat_heat_rear_left', 'mdi:car-seat-heater', 'var(--zc-amber)');
    seg('seat_heat_rear_right', 'mdi:car-seat-heater', 'var(--zc-amber)');
    seg('seat_vent_rear_left', 'mdi:car-seat-cooler', 'var(--zc-blue)');
    seg('seat_vent_rear_right', 'mdi:car-seat-cooler', 'var(--zc-blue)');
    const cov = (key, label, icon) => {
      const id = this._id('cover', key), s = this._s(id); if (!s) return;
      const open = s.state === 'open' || (s.attributes.current_position || 0) > 0;
      const stTxt = GEC_BAD.includes(s.state) ? T('unavailable') : T(open ? 'is_open' : 'is_closed');
      rows.push(`<div class="row"><span class="k" data-more="${esc(id)}"><ha-icon icon="${icon}"></ha-icon>${T(label)} <span class="muted">· ${stTxt}</span></span><span style="display:flex;gap:6px">
        <button class="btn ${open ? 'sel' : ''}" data-act="cover" data-dir="open" data-ent="${esc(id)}" data-key="${esc(key)}">${T('open')}</button>
        <button class="btn ${!open ? 'sel' : ''}" data-act="cover" data-dir="close" data-ent="${esc(id)}" data-key="${esc(key)}">${T('close')}</button></span></div>`);
    };
    cov('all_windows', 'windows', 'mdi:car-door');
    cov('sunroof', 'sunroof', 'mdi:car-select');
    cov('sunshade', 'sunshade', 'mdi:blinds');
    const sw = (key, icon) => {
      const id = this._id('switch', key), s = this._s(id); if (!s) return;
      const on = s.state === 'on';
      rows.push(`<div class="row"><span class="k" data-more="${esc(id)}"><ha-icon icon="${icon}"></ha-icon>${T(key)}</span>
        <span class="seg" style="--c:var(--zc-blue)"><button class="${on ? 'sel' : ''}" ${on ? '' : `data-act="switch" data-ent="${esc(id)}"`}>${T('on')}</button><button class="${!on ? 'sel' : ''}" ${!on ? '' : `data-act="switch" data-ent="${esc(id)}"`}>${T('off')}</button></span></div>`);
    };
    sw('defrost', 'mdi:car-defrost-front');
    const pressRow = (key, label, icon) => {
      const id = this._id('button', key); if (!this._s(id)) return;
      rows.push(`<div class="row"><span class="k" data-more="${esc(id)}"><ha-icon icon="${icon}"></ha-icon>${T(label)}</span>
        <button class="btn" data-act="press" data-ent="${esc(id)}" data-key="${esc(key)}">${T('unlock_btn')}</button></div>`);
    };
    pressRow('unlock_trunk', 'trunk_btn', 'mdi:car-back');
    pressRow('unlock_frunk', 'frunk', 'mdi:car-arrow-right');
    E.det.innerHTML = rows.length ? rows.join('') : `<div class="muted">${T('no_controls')}</div>`;
  }
}


const GEC_EDITOR_SHOW_CHARGER_SWITCH = true;

const GEC_COLOR_SWATCH = {
  silver: '#c5c9d0', grey: '#6d7178', gray: '#6d7178', green: '#1f6a42',
  black: '#1c1c1c', white: '#f5f5f5',
  'aurora-green': '#1a6b4a', 'comet-grey': '#6a6e74', 'moon-white': '#f3f1ec',
  'nebula-beige': '#d9cbb8', 'nova-pink': '#e8b4c4', 'star-silver': '#c8ccd2',
  'alpine-white': '#f7f7f7', 'cloudveil-silver': '#c4c8ce', 'glacier-blue': '#6a8aa8',
  'jungle-green': '#2d5a3a', 'polar-black': '#161616', 'volcanic-grey': '#5a5d62',
};

const GEC_EDITOR_I18N = {
  en: {
    entity_prefix: 'Entity prefix',
    climate_entity: 'Climate entity (optional)',
    language: 'Language',
    model: 'Model',
    color: 'Paint color',
    image_source: 'Car images',
    image_base: 'Local image folder',
    tire_unit: 'Tire pressure unit',
    charge_start_entity: 'Charge start entity',
    charge_stop_entity: 'Charge stop entity',
    charger_switch_entity: 'Charger switch (optional)',
    find_action: 'Find-car action',
    map_marker: 'Map marker',
    time_format: 'Time format',
    precond: 'Pre-conditioning',
    precond_schedule_entity: 'Schedule time helper',
    precond_schedule_enabled_entity: 'Schedule enabled helper',
    precond_settings_entity: 'Pre-conditioning settings helper',
    opt_auto: 'Auto',
    opt_model_auto: 'Auto (detect from entities)',
    opt_generic: 'Generic',
    opt_img_auto: 'Automatic (local, then Geely if missing)',
    opt_img_geely: 'Geely (online images)',
    opt_img_local: 'Local files',
    opt_find_default: 'Default',
    opt_find_map: 'Map',
    opt_find_honk: 'Honk & flash',
    opt_marker_default: 'Default (car)',
    opt_marker_car: 'Car',
    opt_marker_ha: 'Home Assistant default',
    opt_time_default: 'Default',
    opt_time_24: '24-hour',
    opt_time_12: '12-hour',
    opt_tire_default: 'Default (bar)',
    stale_minutes: 'Old-data warning after (minutes, 0 = off)',
  },
  he: {
    entity_prefix: 'קידומת ישויות',
    climate_entity: 'ישות מיזוג (רשות)',
    language: 'שפה',
    model: 'דגם',
    color: 'צבע',
    image_source: 'תמונות הרכב',
    image_base: 'תיקיית תמונות מקומית',
    tire_unit: 'יחידת לחץ צמיגים',
    charge_start_entity: 'התחל טעינה',
    charge_stop_entity: 'הפסק טעינה',
    charger_switch_entity: 'מתג מטען (רשות)',
    find_action: 'פעולת מצא רכב',
    map_marker: 'סיכת מפה',
    time_format: 'פורמט שעה',
    precond: 'מיזוג מראש',
    precond_schedule_entity: 'עוזר שעת הפעלה',
    precond_schedule_enabled_entity: 'עוזר הפעלת לוח זמנים',
    precond_settings_entity: 'עוזר הגדרות מיזוג מראש',
    opt_auto: 'אוטומטי',
    opt_model_auto: 'אוטומטי (זיהוי לפי ישויות)',
    opt_generic: 'כללי',
    opt_img_auto: 'אוטומטי (מקומי, ואז Geely אם חסר)',
    opt_img_geely: 'Geely (תמונות מקוונות)',
    opt_img_local: 'קבצים מקומיים',
    opt_find_default: 'ברירת מחדל',
    opt_find_map: 'מפה',
    opt_find_honk: 'צפירה והבהוב',
    opt_marker_default: 'ברירת מחדל (הרכב)',
    opt_marker_car: 'הרכב',
    opt_marker_ha: 'ברירת מחדל של Home Assistant',
    opt_time_default: 'ברירת מחדל',
    opt_time_24: '24 שעות',
    opt_time_12: '12 שעות',
    opt_tire_default: 'ברירת מחדל (bar)',
    stale_minutes: 'אזהרת נתונים ישנים אחרי (דקות, 0 = כבוי)',
  },
};

class Geely3DCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this.attachShadow({ mode: 'open' });
  }
  set hass(hass) { this._hass = hass; this._render(); }
  setConfig(config) {
    this._config = { ...(config || {}) };
    this._render();
  }
  _he() {
    const lang = String((this._hass && this._hass.language) || '').toLowerCase();
    return lang === 'he' || lang === 'iw' || lang.startsWith('he-');
  }
  _t(key) {
    const pack = GEC_EDITOR_I18N[this._he() ? 'he' : 'en'];
    return pack[key] || GEC_EDITOR_I18N.en[key] || key;
  }
  _modelKey() {
    return String(this._config.model || 'auto').toLowerCase().replace(/[\s-]+/g, '_') || 'auto';
  }
  _colorOptions(model) {
    const colors = model === 'auto'
      ? [...new Set(Object.keys(GEC_CDN).flatMap((k) => GEC_cdnColors(k)))]
      : GEC_cdnColors(model);
    const opts = colors.map((c) => ({ value: c, label: GEC_colorLabel(c) }));
    opts.unshift({ value: '', label: '—' });
    return opts;
  }
  _showImageBase() {
    const src = String(this._config.image_source || '').toLowerCase();
    return src !== 'geely';
  }
  _isGeelySource(cfg) {
    return String((cfg || this._config).image_source || '').toLowerCase() === 'geely';
  }
  _schema() {
    const t = (k) => this._t(k);
    const colors = this._colorOptions(this._modelKey());
    const chargeSel = { entity: { domain: ['button', 'switch', 'script', 'input_button'], filter: { domain: ['button', 'switch', 'script', 'input_button'] } } };
    const schema = [
      { name: 'entity_prefix', required: true, selector: { text: {} } },
      { name: 'climate_entity', selector: { entity: { domain: 'climate' } } },
      { name: 'language', selector: { select: { mode: 'dropdown', options: [
        { value: 'auto', label: t('opt_auto') },
        { value: 'en', label: 'English' },
        { value: 'he', label: 'עברית' },
      ] } } },
      { name: 'model', selector: { select: { mode: 'dropdown', options: [
        { value: 'auto', label: t('opt_model_auto') },
        { value: 'ex5', label: 'EX5' },
        { value: 'e5', label: 'E5' },
        { value: 'ex2', label: 'EX2' },
        { value: 'starray_emi', label: 'Starray EM-i' },
        { value: 'generic', label: t('opt_generic') },
      ] } } },
      { name: 'color', selector: { select: { mode: 'dropdown', options: colors } } },
      { name: 'image_source', selector: { select: { mode: 'dropdown', options: [
        { value: '', label: t('opt_img_auto') },
        { value: 'geely', label: t('opt_img_geely') },
        { value: 'local', label: t('opt_img_local') },
      ] } } },
    ];
    if (this._showImageBase()) {
      schema.push({ name: 'image_base', selector: { text: {} } });
    }
    schema.push(
      { name: 'tire_unit', selector: { select: { mode: 'dropdown', options: [
        { value: '', label: t('opt_tire_default') },
        { value: 'bar', label: 'bar' },
        { value: 'psi', label: 'psi' },
        { value: 'kpa', label: 'kPa' },
      ] } } },
      { name: 'charge_start_entity', selector: chargeSel },
      { name: 'charge_stop_entity', selector: chargeSel },
    );
    if (typeof GEC_EDITOR_SHOW_CHARGER_SWITCH !== 'undefined' ? GEC_EDITOR_SHOW_CHARGER_SWITCH : true) {
      schema.push({ name: 'charger_switch_entity', selector: { entity: { domain: 'switch', filter: { domain: 'switch' } } } });
    }
    schema.push(
      { name: 'find_action', selector: { select: { mode: 'dropdown', options: [
        { value: '', label: t('opt_find_default') },
        { value: 'map', label: t('opt_find_map') },
        { value: 'honk', label: t('opt_find_honk') },
      ] } } },
      { name: 'map_marker', selector: { select: { mode: 'dropdown', options: [
        { value: '', label: t('opt_marker_default') },
        { value: 'car', label: t('opt_marker_car') },
        { value: 'default', label: t('opt_marker_ha') },
      ] } } },
      { name: 'time_format', selector: { select: { mode: 'dropdown', options: [
        { value: '', label: t('opt_time_default') },
        { value: '24h', label: t('opt_time_24') },
        { value: '12h', label: t('opt_time_12') },
      ] } } },
      { name: 'stale_minutes', selector: { number: { min: 0, max: 1440, step: 5, mode: 'box' } } },
      { type: 'expandable', title: t('precond'), expanded: false, schema: [
        { name: 'precond_schedule_entity', selector: { entity: { domain: 'input_datetime' } } },
        { name: 'precond_schedule_enabled_entity', selector: { entity: { domain: 'input_boolean' } } },
        { name: 'precond_settings_entity', selector: { entity: { domain: 'input_text' } } },
      ] },
    );
    return schema;
  }
  _fieldNames(schema) {
    const names = [];
    for (const s of (schema || this._schema())) {
      if (s && s.type === 'expandable' && s.schema) names.push(...this._fieldNames(s.schema));
      else if (s && s.name) names.push(s.name);
    }
    return names;
  }
  _empty(v) { return v == null || v === ''; }
  _deepEqual(a, b) {
    if (a === b) return true;
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
        return a.every((v, i) => this._deepEqual(v, b[i]));
      }
      const ak = Object.keys(a), bk = Object.keys(b);
      if (ak.length !== bk.length) return false;
      return ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && this._deepEqual(a[k], b[k]));
    }
    return false;
  }
  _formData() {
    const d = { ...this._config };
    if (!('image_source' in d)) d.image_source = '';
    if (!('model' in d)) d.model = 'auto';
    if (!('language' in d)) d.language = 'auto';
    if (!('find_action' in d)) d.find_action = '';
    if (!('map_marker' in d)) d.map_marker = '';
    if (!('time_format' in d)) d.time_format = '';
    if (!('tire_unit' in d)) d.tire_unit = '';
    return d;
  }
  _commit(value) {
    const prev = this._config || {};
    const next = { ...prev };
    const fields = this._fieldNames();
    const omitValues = {
      image_source: [''], model: ['', 'auto'], language: ['', 'auto'],
      find_action: [''], map_marker: [''], time_format: [''], tire_unit: [''],
    };
    for (const key of fields) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      let v = value[key];
      if (v == null) v = '';
      if (typeof v === 'string') v = v.trim();
      const had = Object.prototype.hasOwnProperty.call(prev, key);
      const omits = omitValues[key] || [''];
      const isOmit = omits.includes(v);
      if (isOmit) {
        if (!had) continue;
        if (prev[key] === v || omits.includes(String(prev[key]))) continue;
        if (v === '') delete next[key];
        else next[key] = v;
        continue;
      }
      if (had && prev[key] === v) continue;
      next[key] = v;
    }
    const norm = (v) => String(v || 'auto').toLowerCase().replace(/[\s-]+/g, '_');
    if (norm(next.model) !== norm(prev.model) && this._isGeelySource({ ...prev, ...next })) {
      const def = GEC_cdnDefault(norm(next.model));
      if (def) next.color = def;
      else if (norm(next.model) === 'generic') delete next.color;
    }
    if (this._deepEqual(next, prev)) return prev;
    this._config = next;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: next }, bubbles: true, composed: true }));
    this._render();
    return next;
  }
  _onChange(value) { return this._commit(value || {}); }
  _esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  _render() {
    const root = this.shadowRoot;
    const he = this._he();
    this.setAttribute('dir', he ? 'rtl' : 'ltr');
    const labels = GEC_EDITOR_I18N[he ? 'he' : 'en'];
    const data = this._formData();
    const schema = this._schema();
    const color = data.color;
    const swatch = color && GEC_COLOR_SWATCH[color];
    const style = `:host{display:block}
      .swatch-row{display:flex;align-items:center;gap:8px;margin:0 0 12px;font:13px var(--mdc-typography-body2-font-family,sans-serif);color:var(--primary-text-color,#212121)}
      .swatch{width:18px;height:18px;border-radius:50%;border:1px solid rgba(127,127,127,.45);box-shadow:inset 0 0 0 1px rgba(255,255,255,.2);flex:0 0 auto}
      .fallback{display:grid;gap:12px;font:14px var(--mdc-typography-body2-font-family,sans-serif);color:var(--primary-text-color,#212121)}
      .fallback label{display:flex;flex-direction:column;gap:4px;font-weight:500}
      .fallback input,.fallback select{font:inherit;padding:8px 10px;border-radius:6px;border:1px solid var(--divider-color,#c4c4c4);background:var(--card-background-color,#fff);color:inherit}
      .fallback details{border:1px solid var(--divider-color,#c4c4c4);border-radius:8px;padding:8px 10px}
      .fallback details>summary{cursor:pointer;font-weight:600;margin-bottom:8px}
      :host([dir="rtl"]) .fallback label,:host([dir="rtl"]) .swatch-row{text-align:right}
      .fallback input{direction:ltr;unicode-bidi:isolate;text-align:left}`;
    const computeLabel = (s) => (s && (labels[s.name] || s.title || s.name)) || '';
    if (customElements.get('ha-form')) {
      if (!this._form) {
        root.innerHTML = `<style>${style}</style><div class="swatch-row"${swatch ? '' : ' hidden'}><span class="swatch"></span><span class="swatch-name"></span></div>`;
        const form = document.createElement('ha-form');
        this._form = form;
        form.addEventListener('value-changed', (ev) => this._onChange((ev.detail && ev.detail.value) || {}));
        root.appendChild(form);
      }
      const row = root.querySelector('.swatch-row');
      if (row) {
        row.hidden = !swatch;
        const s = row.querySelector('.swatch');
        const n = row.querySelector('.swatch-name');
        if (s) s.style.background = swatch || 'transparent';
        if (n) n.textContent = GEC_colorLabel(color || '');
      }
      this._form.hass = this._hass;
      this._form.data = data;
      this._form.schema = schema;
      this._form.computeLabel = computeLabel;
      return;
    }
    const fieldHtml = (s) => {
      const lab = computeLabel(s);
      const val = data[s.name] == null ? '' : data[s.name];
      if (s.selector && s.selector.select) {
        const opts = s.selector.select.options.map((o) => {
          const v = typeof o === 'string' ? o : o.value;
          const l = typeof o === 'string' ? o : o.label;
          return `<option value="${this._esc(v)}"${String(v) === String(val) ? ' selected' : ''}>${this._esc(l)}</option>`;
        }).join('');
        return `<label>${this._esc(lab)}<select name="${this._esc(s.name)}">${opts}</select></label>`;
      }
      return `<label>${this._esc(lab)}<input name="${this._esc(s.name)}" value="${this._esc(val)}"></label>`;
    };
    const parts = [];
    for (const s of schema) {
      if (s.type === 'expandable') {
        const inner = (s.schema || []).map(fieldHtml).join('');
        parts.push(`<details class="exp"${s.expanded ? ' open' : ''}><summary>${this._esc(s.title || '')}</summary>${inner}</details>`);
      } else {
        parts.push(fieldHtml(s));
      }
    }
    const sw = swatch ? `<div class="swatch-row"><span class="swatch" style="background:${this._esc(swatch)}"></span><span class="swatch-name">${this._esc(GEC_colorLabel(color || ''))}</span></div>` : '';
    root.innerHTML = `<style>${style}</style>${sw}<form class="fallback">${parts.join('')}</form>`;
    const form = root.querySelector('form');
    form.addEventListener('change', () => {
      const fd = {};
      for (const el of form.elements) if (el.name) fd[el.name] = el.value;
      this._onChange(fd);
    });
  }
}

if (!customElements.get('geely-3d-card-editor')) customElements.define('geely-3d-card-editor', Geely3DCardEditor);

if (!customElements.get('geely-3d-card')) customElements.define('geely-3d-card', Geely3DCard);
if (!customElements.get('geely-ex5-card')) customElements.define('geely-ex5-card', class extends Geely3DCard {});   // old name (v1.0-1.2)
window.customCards = window.customCards || [];
if (!window.customCards.find((c) => c.type === 'geely-3d-card'))
  window.customCards.push({ type: 'geely-3d-card', name: 'Geely 3D Card', description: 'Geely car status & controls with a drag-to-rotate 360° view', preview: false, documentationURL: 'https://github.com/1immortal/geely-3d-card' });
console.info(`%c GEELY-3D-CARD %c ${GEC_VERSION} `, 'background:#4fb3ff;color:#10141d;font-weight:700', 'background:#10141d;color:#e8eef8');
