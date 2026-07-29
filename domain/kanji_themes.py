"""Hand-authored thematic groupings for the N3–N1 kanji level decks.

Before this, N3/N2/N1 had three or four authored categories each covering ~30
kanji, and everything else fell into fixed-size blocks named ``"Kanji 1"`` …
``"Kanji 59"`` — 101 of the app's 122 blocks were interchangeable numbered chips.
Component data cannot fix that (see :mod:`domain.kanji_ordering`): KRADFILE
decomposes visually, so the part a block shares is a stroke, not a subject.
Naming needs meaning, and meaning has to be authored.

These are *block* definitions, not decks. The older categories in
:mod:`domain.decks` are registered decks with their own ``id_offset``, which is
how a card used to end up with two ids and two SRS schedules (issue #78). Themes
here name a group of characters and nothing else; :mod:`domain.blocks` resolves
them against the parent level deck, so no ids are allocated and no SRS state can
collide.

Grouping is by subject, not by strict semantic field — a theme is a study unit of
roughly twenty, so a few members sit at the edge of their heading. That is still
far more use than a number. Every character must exist in its level's deck and
appear in exactly one theme per level; :mod:`tests.test_kanji_themes` asserts
both, so a corpus change that drops a kanji fails loudly.
"""

from __future__ import annotations

# level slug → ordered themes, each a (heading, characters) pair. The first few
# per level were registered decks until they were folded in here; they keep
# their names and their leading position, so block order is unchanged.
KANJI_THEMES: dict[str, tuple[tuple[str, str], ...]] = {
    # N5's five categories leave eight cards over — too few and too mixed to split
    # further, so this names the block the deck already had rather than
    # repartitioning curated content.
    "kanji_n5": (
        ("Numbers & Time", "一二三四五六七八九十百千万年月日時分半火水木金土"),
        ("Nature & World", "山川田花天雨上下左右前後東西南北中外内大小長高古新安白赤青"),
        ("People & Body", "人子父母男女友目口耳手足力気"),
        ("Study & Language", "学校生先語国文字本"),
        ("Actions & Travel", "見聞食飲来行帰書読立入出休電車"),
        ("Time, Talk & Money", "間今午毎話名何円"),
    ),
    "kanji_n4": (
        ("Society & Roles", "会同者名主全定代"),
        ("Mind & Thought", "思知体化心対相意"),
        ("Daily Life", "自内住場間野家"),
        ("Time & Action", "事動時作何開方"),
        ("Work & Business", "社業員売買借貸料仕用使工建"),
        ("Study & Language", "問言理教文考計研究試験習漢英答勉"),
        ("Arts & Pictures", "楽音歌映画写図"),
        ("Time & Seasons", "元始朝終早去夜古夕曜昼春秋夏冬世"),
        ("Places & Buildings", "京院道町店室館屋堂市村都府界"),
        ("Body & Health", "手目口足力立病医薬死"),
        ("Movement & Travel", "発通転着帰歩走旅泳乗降起送"),
        ("Nature & Animals", "田海空風花洋鳥牛魚犬"),
        ("Colour & Light", "黒赤青色銀明暗"),
        ("Family & People", "私族親弟兄妹姉公"),
        ("Quality & Amount", "新強弱重広真有正安悪特質多少度近遠不以"),
        ("Food & Everyday Things", "品物台紙服味飲飯"),
        ("Everyday Actions", "集別切止待持"),
    ),
    "kanji_n3": (
        ("Governance", "政経連務命算関"),
        ("Communication", "保所応想告調守"),
        ("Movement", "旅初続少急起転"),
        ("Achievement", "勝負達術要価差利熱"),
        ("Government & Law", "議民法制治官権判罪犯警規許否賛責号属任役部組"),
        ("Business & Money", "商産資財費収給払値済供富貧配営得与"),
        ("Amount & Degree", "数全両増減満余皆幾等積程割限加単残欠位回最過段格"),
        ("Thinking & Judging", "解察識覚定選当実性直確必然適良観認断探"),
        ("Doubt & Mistake", "疑忘信易誤迷難非偶状査検科"),
        ("Feelings & Character", "感情愛喜悲怒恐怖幸笑好望恥困静美福偉"),
        ("Body & Health", "首頭顔耳歯髪腹背息吸痛薬眠寝声呼指太抱疲"),
        ("Movement & Travel", "進退登降飛乗船渡越逃追迎到流速散浮押引戻投落訪返"),
        ("Time & Sequence", "期歳際予次番常昔末更遅現存在未緒"),
        ("Place & Building", "都市港園宅庭窓座路途居宿"),
        ("People & Family", "夫妻婦娘祖婚君師徒彼王老若育"),
        ("Conflict & Danger", "戦争殺破倒盗危険敗失亡打捕突"),
        ("Nature & Weather", "米石葉草雪晴陽煙冷寒景候光種馬猫鳴吹暗"),
        ("Speech & Writing", "記報伝説談論示申辞頼願求提"),
        ("Cause & Result", "化成果因由消除完閉絶合原受抜取放"),
        ("Work & Skill", "働勤労管機支能優備助処努精慣忙才導設係"),
        ("Shape & Object", "形式面容球構具箱杯束折刻掛深平雑様"),
        ("Position & Relation", "対内相共交向反側置横違遠互似接付留込寄"),
        ("Daily Life & Leisure", "和活演舞便曲招絵遊夢暮酒洗礼泳頂靴御神参"),
    ),
    "kanji_n2": (
        ("Professionalism", "率責略範模精密講座"),
        ("Economics", "援競争預貯資補総"),
        ("Analysis", "診療測況源穏緊圧縮拡訳省境"),
        ("Government & Administration", "協区領県委団州域欧署庁令臣籍郵姓権衛裁庶統"),
        ("Industry & Trade", "税営農販貿貨輸造築械鉱炭耕畜漁採掘埋益設"),
        ("War & Danger", "勢防武兵将禁暴爆乱卒障危撃"),
        ("Number & Measure", "減比額準個極量倍均億層角枚双兆冊匹軒粒畳隻"),
        ("Time & Change", "改革再復移旧久停延昇傾季永翌替即換"),
        ("Records & Writing", "述象史録編歴印著誌刊像巻紹簡章筆訓詞評刷"),
        ("Work & Method", "導担被技専管接効捜介練績触刺企幹促択演需操獲芸"),
        ("Body & Health", "脳血骨胸腕肩腰肌膚鼻毛皮脂涙汗乳齢患悩臓"),
        ("Land & Water", "島村谷森林河岸池湖泉岩砂陸波氷泥貝虫羽灰"),
        ("Weather & Sky", "温湿沸蒸溶凍乾燥曇滴涼濃薄清浅沈干荒雲震星"),
        ("Food & Plants", "竹根植菜卵麦粉菓塩甘辛湯咲枝香油喫枯"),
        ("Materials & Things", "鉄材板札布綿糸玉針筒机袋帽衣装灯盤符缶瓶皿帯"),
        ("Buildings & Places", "階橋戸床寺庫宇底坂郊隅柱城蔵辺周囲裏奥沿央"),
        ("Feelings & Virtue", "恋憎快敬尊祈祝勇賢珍純希依肯承仏祭拝栄叫"),
        ("Appearance & Quality", "型丸短低細軽硬軟鋭鈍固厚豊普幅環片混伸柔巨紅緑黄"),
        ("People & Relations", "童児孫仲殿召伺雇募群幼贈"),
        ("Travel & Transport", "航輪舟踊駐届跡超泊荷"),
        ("Order & Rule", "各諸則律逆詰包含並般副占了絡複封順違"),
        ("Home & Cleaning", "掃捨塗拾磨挟浴濯焼燃照宝汚"),
    ),
    "kanji_n1": (
        ("Law & Order", "罰遵罷顧諾賛勲審"),
        ("Society & Power", "顕諭擁護闘緩隷宰亜赴該"),
        ("Literary Arts", "憂曖昧鬱償懸璧巧繊維羅"),
        ("State & Monarchy", "統皇帝陛后妃朕勅詔爵侯藩邦郷憲廷吏尚"),
        ("Politics & Office", "派閥盟覇衆僚督帥曹尉宮閣邸庄"),
        ("Law & Justice", "裁訴訟獄囚拘逮刑赦劾懲戒免"),
        ("Crime & Deceit", "詐欺拐窃賊匿奪殴拷虐凶偽"),
        ("War & Weapons", "撃討攻侵襲征艦砲弾剣刀矢弓盾矛伐虜射弦刃"),
        ("Business & Finance", "株債賃購銭賄租賦俸稼貢献融卸幣款"),
        ("Industry & Metal", "製鋼鋳錬鍛窯炉磁硫硝鉛銑錠冶"),
        ("Body Parts", "筋眼瞳眉唇舌肢髄肝胆脚拳襟衿眸黛"),
        ("Illness & Medicine", "胞胎妊娠痘痢疫症癒剤飢餓窒傷厄禍癖疾脅障康健"),
        ("Grief & Longing", "慰悦憾悔恨憤慨哀愁嘆悼惜憧慕喪寂惨"),
        ("Fruit Trees", "杏柚椰橘栗梨李桜梅桃桑椿"),
        ("Timber Trees", "桐梓梧椎槻樺檀杜樹松杉楠"),
        ("Woodland & Shrubs", "柊梢椋楊楓榛槙柳桂柾"),
        ("Flowers", "芙茉茜莉菖菫葵萩菊蓮蘭舜蓉藤"),
        ("Herbs & Crops", "芹蕗芳苑蕉薪薫麻藍芋茄"),
        ("Grass & Reeds", "笹莞蒔蔦藻芝茅茂萌"),
        ("Animals", "鹿熊猿虎鶴鯨豚鶏鳩蛇亀猪蚊蛍蚕鯉鯛隼鷹獣竜雌雛翼鮎鳳鴻鵬麟啄"),
        ("Water & Coast", "沢浜江浦津沼滝磯洲渚潟浪潮漂沙皐崎"),
        ("Mountains & Land", "岳峰峡岬渓丘壌塊坑穴洞垣堀尭崚嵯嶺巌峻"),
        ("Weather & Sky", "雷霜霧虹嵐暁曙旦晨宵陰霞宙雰露冴凜凪奎彗朔爽颯"),
        ("Religion & Spirit", "宗禅霊魂鬼魔幻聖誓奉崇葬墓弔忌斎殉塚墳陵幽遺魅仙儀"),
        ("Thought & Insight", "推慮概悟惟憶智哲釈析偲怜慧聡諒叡"),
        ("Speech & Persuasion", "唱詠吟謡諮勧奨誘唆詢"),
        ("Writing & Record", "簿稿譜銘紋暦帳謄抄訂閲典条序範標項叙栞"),
        ("Arts & Music", "彫鼓笛戯俳棋娯奏塑陶描伎伶笙"),
        ("Cloth & Clothing", "絹紬紗綾錦緋褐裸帆縫繭袈裟冠履絢"),
        ("Food & Cooking", "糧穀稲豆糖酢汁煮炊酵醸漬酌酪侑脩"),
        ("Movement & Force", "躍跳踏駆奔遂遷巡循搬搭昂晋暢捷翔"),
        ("Holding & Handling", "握把扱据挿捺摂繰擦摩"),
        ("Growth & Decay", "殖培栽穫苗芽茎穂朽腐衰滋稔穣"),
        ("Old Units & Measures", "寸尺升斗厘匁勺坪畝斤箇錘衡緯径"),
        ("Size & Extent", "凸凹微狭甚稀稜嵩弘弥悠浩碩紘喬宏亘"),
        ("Degree & Ranking", "准圏率秩第節斜旬暫涯距較頻弧緻"),
        ("Classical Particles", "之乃也爾只且但亦於哉耶那猶如宜是某為又須既故麿亨"),
        ("Zodiac & Old Numbers", "乙丙丁丑寅卯辰巳亥巴甲酉弐壱伍己"),
        ("Old Names & Places", "伊倭奈巽甫秦胡阿"),
        ("Virtue & Duty", "仁忠義徳善誠貞廉悌倫修謹恭敦惇允匡"),
        ("Calm & Humility", "謙篤慎寛靖淑妥泰穏粛遜厳倹寧欽洵淳晏"),
        ("Help & Compassion", "佑輔丞扶恵慈恩憩睦懇薦救励祉保佐亮伽恕渥祐宥"),
        ("Excellence & Beauty", "傑秀佳俊麗艶綺斐雅彩華姿卓博敏飾鮮嬉彬郁馨"),
        ("Fault & Foolishness", "愚痴拙劣卑侮醜濁粗惰怠冗妄漠疎乏偏嫌弊辱邪酷仮諄"),
        ("Strength & Daring", "剛毅勁猛烈敢屈堅頑壮威奮徹耐貫豪隆雄冒堪克嚇侃凌赳魁"),
        ("Officials & Ranks", "士郎伯侍奴儒匠司叔屯偵賓"),
        ("Family & Marriage", "姻嫁婿嬢姫媛婆尼孤胤嫡孟寡翁彦昆嗣"),
        ("Buildings & Rooms", "舎舗亭楼廊壇塀棚棺槽扉扇郭堤壁倉房枢架桟街荘隅井孔幕塁邑"),
        ("Roads & Journeys", "往徐逝逐逓遍遭遣遥遼迅迫透逸遇遮遡迭避還岐迪"),
        ("Ships & Horses", "舶艇駒駿騎駄載軌轄"),
        ("Fall & Ruin", "致至及陥堕墜没滅崩壊廃棄斥阻却妨衝顛"),
        ("Jewels & Ornament", "圭玖玲珠琉琢琳瑚瑛瑠瑳瑶璃"),
        ("Metal Objects", "鑑鏡鐘鎌鎖鎮錯鈴"),
        ("Colour & Light", "紫朱丹碧蒼黎墨晶玄皓燦燿耀暉晃旭昴影染彰昭朗輝翠彪晟熙"),
        ("Thread & Weaving", "紡索糾綱網縄縛縦縮繁織繕締結絞継級紀納素紛紳累絃綜綸"),
        ("Farming & Livestock", "牧牲犠飼養羊畔肥狩猟巣墾刈釣獲"),
        ("Rivers & Springs", "汐汰汽沖沿泌泡浄浸淡渇渉渋渦湧源溝滑滞洸澪"),
        ("Deep Water", "漆漏漫漱漸潔潜潤澄激濫瀬洪礁噴滉"),
        ("Fire & Heat", "災炎焦熟暑暖燎"),
        ("Mind & Feeling", "惑態懐我志応忍恒怪愉慢煩狂驚趣躊躇虞衷勘歓凝"),
        ("Seeing & Watching", "視覧監看眺瞬盲睡泣伏仰垂吐拍呈瞭"),
        ("Speech & Praise", "託証詳誇誉請謁謝陳酬褒称聴尋弁宣旨啓黙頌嘉"),
        ("Sound & Voice", "響韻唄喚喝騒凱"),
        ("Resist & Repel", "批抑抗抵拒排控搾撤撲覆"),
        ("Grasp & Raise", "拓括挙振掲提揚揮携張執摘"),
        ("Spread & Handle", "披抹抽拡挑掌揺撮操敷翻"),
        ("Body & Flesh", "肪脱脹膨臭殻尾呂"),
        ("Fortune & Omen", "吉祥禄禎瑞賀慶誕徴盛倖昌欣旺"),
        ("Value & Worth", "価貴賠功益騰基礎端系"),
        ("Giving & Receiving", "享戴授譲頒采賜叶呉"),
        ("Plan & Undertake", "企謀措拠施旋催契就展幹整矯践臨興秘隠嘱創促竣肇"),
        ("Together & Apart", "伴併兼隣陪随従離縁添附斉朋独傍媒唯輩隔属誼"),
        ("Fill & Empty", "充剰尽虚裕蓄飽耗窮惣"),
        ("Custom & Society", "俗庸凡蛮奇妙暇稚朴酔閑殊粘宴"),
        ("Shaping & Copying", "剖裂砕削倣擬肖"),
        ("Everyday Objects", "傘俵鉢旗柄器盤鞠毬"),
    ),
}
