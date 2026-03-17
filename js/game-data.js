// ===== GAME DATA - pure constants extracted from research-optimizer-v2.html =====

export const GRID_COLS = 20;
export const GRID_ROWS = 12;
export const GRID_SIZE = 240;

// ResGridSquares: [name, maxLV, bonusPerLV, ?, ?, description...]
export const RES_GRID_RAW = {
  31: ["Smart_Eye",3,5,"Raises_the_minimum_possible_Roll_by_+1_for_each_failed_Roll,_up_to_+$._This_resets_back_to_0_upon_a_successful_Roll._Also_+{%_Research_EXP_Gain."],
  47: ["Sticker-it_To_Em!",2,1,"Unlocks_a_new_TRUE_Damage_Multiplier_as_shown_in_the_Sticker_Depot,_which_goes_up_by_+{%_for_every_Sticker_you_find!"],
  48: ["Materials_Science",4,25,"Reduces_the_Cycle_Time_for_the_Polymerization_tab_in_the_Refinery_by_{%"],
  49: ["Polymer_Refinery",2,5,"Unlocks_a_new_tab_in_the_Refinery,_POLYMERIZATION!_Also,_+{%_faster_refinery_cycles_for_ALL_tabs!"],
  50: ["Pts_Every_Ten",1,5,"Get_+|_extra_Research_PTS_every_10_Research_LVs!_Also,_+{%_Research_EXP_Gain!"],
  51: ["Sharp_Eye",4,5,"Increase_the_max_possible_Roll_while_searching_for_new_observations_by_+|,_and_+{%_Research_EXP_gain!"],
  52: ["Holding_Onto_You",3,10,"Twists_the_Kaleidoscope_behind_both_of_your_eyes,_increasing_their_effect_by_+{%"],
  67: ["Sticky_Crowns",3,25,"For_every_King_Rat_Crown_you_reclaim,_your_Megacrop_growth_chance_goes_up_by_{%._Total_Bonus:^x"],
  68: ["Boony_Crowns",1,1,"For_every_King_Rat_Crown_you_reclaim,_all_your_stickers_gives_{%_higher_bonuses._Total_Bonus:$%"],
  69: ["Adequate_Sized,_Actually",2,50,"All_Tiny_Cogs_you_get_have_a_{%_chance_be_1_Tier_higher_than_they_otherwise_would've_been!_Huge,_honestly!"],
  70: ["Takin'_Notes",4,12,"Multiplies_Research_EXP_gain_by_}x,_TRUE_multiplier_style!_So_this_bonus_will_never_be_additive!"],
  71: ["Powered_Down_Research",2,1,"Further_increases_your_Research_AFK_Gains_rate_by_+{%,_in_your_unending_quest_for_100%"],
  72: ["Kaleidoscope",4,5,"Gives_+|_Kaleidoscopes_to_use_for_Observations!_Also,_+{%_Kaleidoscope_effect!"],
  87: ["Gaming_Zuperbits",2,200,"Unlocks_the_Zuperbits_page_of_Superbits_in_Gaming!_Yea,_you_ain't_done_with_those_just_yet!_Also_gives_}x_Gaming_Bit_Multi!"],
  88: ["Sticker_Depot",3,50,"Unlocks_the_Sticker_mechanic_for_Farming!_Also,_boosts_Megacrop_growth_chance_by_}x"],
  89: ["Tiny_Cogs",4,200,"Unlocks_the_Tiny_Cog_board,_and_generates_a_single_Tiny_Cog_per_day!_Also_boosts_Flaggy_Rate_by_}x"],
  90: ["Observationalistic",4,1,"Gives_you_+|_more_Daily_Rolls_for_getting_new_Observations!_Also,_+{%_Research_EXP_gain!"],
  91: ["Optical_Monocle",4,1,"Gives_+|_Optical_Monocles_to_use_for_Observations!_Also_+{%_Insight_EXP_gain,_to_level_up_your_Observations_faster_with!"],
  92: ["Oracular_Spectacular",2,25,"Taking_only_what_you_need_from_it,_your_Optical_Monocles_generate_+{%_more_Insight!"],
  93: ["Game_Design_101",3,4,"Psst..._you_forgot_to_give_Observation_LV_a_purpose_while_helping_Lava_research_new_content!_How_about_you_do..._Observations_give_}x_more_EXP_per_LV!"],
  94: ["Game_Design_102",4,1,"Design_problem,_why_would_players_level_up_old_Observations?_How_about..._+{%_Research_EXP_per_TOTAL_Observation_LV!_@_Total_Bonus:$%"],
  107: ["Palettable_Crowns",1,3,"+{%_Palette_Luck_for_every_King_Rat_Crown_you_reclaim._@_Total_Bonus:$%"],
  108: ["Rat_King_of_Olde",2,25,"You_can_now_buy_the_Rat_King_from_the_Import_Shop_in_Gaming!_Also,_+{%_King_Tokens_per_hour!"],
  109: ["Transcendent_Artifacts",1,25,"Unlocks_Transcendent_Sailing_Artifacts_tier,_and_boosts_Artifact_Find_Chance_by_a_smol_+{%"],
  110: ["All_Night_Studying",2,50,"Boosts_Research_EXP_gain_by_+{%_@_You'll_be_filling_out_this_Grid_in_no_time_at_all!"],
  111: ["Research_AFK_Gains",2,5,"+{%_Research_AFK_Gains._This_affects_OFFLINE_gains_for_Research,_Minehead,_Insight..._everything_Research_related!"],
  112: ["See_'Em_All",1,5,"+{%_Research_EXP_gain_per_Observation_found!_@_Total_Bonus:+$%"],
  127: ["Eclectoplasmaticism",1,1,"What_kind_of_word_is_Eclectopl..._whatever,_this_gives_you_+{%_TRUE_DMG_Multi_per_Eclectic_Sigil!"],
  128: ["Eclectic_Sigils",1,10,"Sigils_can_be_upgraded_a_5th_time_to_Eclectic!_@_NOTE:You_must_defeat_Lore_Boss_7_in_Spelunking_first!"],
  129: ["Mr_Minehead_Linguistics",4,10,"You_can_now_speak_to_Mr_Minehead_and_play_his_Depth_Charge_game!_Also,_+{_base_Minehead_Currency/hr"],
  130: ["Legendary_Yellow_Fever",3,5,"Raises_the_Max_LV_of_certain_Yellow_Legend_Talents_by_+|._Also,_}x_Class_EXP_gain!"],
  131: ["Legendary_Red_Fever",3,5,"Raises_the_Max_LV_of_certain_Red_Legend_Talents_by_+|._@_Also,_}x_Class_EXP_gain!"],
  132: ["Legendary_Brown_Fever",3,5,"Raises_the_Max_LV_of_certain_Brown_Legend_Talents_by_+|._Also,_}x_Class_EXP_gain!"],
  146: ["Risky_Strategy",2,10,"Your_Minehead_Damage_is_boosted_by_+{%_for_every_tile_revealed_in_a_single_turn._This_resets_at_the_start_of_every_turn."],
  147: ["Depth_Charge_Rematch!",4,25,"Gives_you_+|_more_tries_every_day_at_Mr_Minehead's_Depth_Charge!_Also,_+{%_Minehead_Currency/hr"],
  148: ["More_of_that_Minehead_Money_Pls",4,25,"Multiplies_Minehead_Currency/hr_by_}x"],
  149: ["Glimbo_Linguistics",1,15,"You_can_now_speak_to_Glimbo,_and_make_trades_with_him!_Also_boosts_coins_dropped_by_monsters_by_}x!"],
  150: ["Masterclass_Research",2,10,"Reduces_the_cost_of_all_Masterclass_upgrades_by_{%_every_day,_FOREVER!_Total_Reduction:-&%"],
  151: ["Spelunking_Research",2,25,"Boosts_Spelunking_POW_by_+{%_every_day,_FOREVER!_@_Total_Boost:^x_POW"],
  152: ["Legendary_Green_Fever",3,5,"Raises_the_Max_LV_of_certain_Green_Legend_Talents_by_+|._Also,_}x_Class_EXP_gain!"],
  167: ["Minehead_Damagio",3,15,"Multiplies_all_damage_you_deal_in_Mr_Minehead's_Depth_Charge_by_}x"],
  168: ["Glimbo_Insider_Trading_Secrets",1,1,"+{%_Drop_Rate_TRUE_Multi_per_100_Glimbo_Trades!_@_Total_Bonus:^x_DR"],
  169: ["Glimbo_BOGO_Offer",2,10,"Some_of_Glimbo's_trades_give_+|_additional_LVs!_This_works_retroactively._Also,_}x_Coin_gain"],
  170: ["All_Quick_All_Done",3,50,"Every_day,_the_first_'All_Quick'_use_at_the_MSA_in_World_3_gives_}x_more_Souls_and_EXP!"],
  171: ["Day_'N'_Nite",4,50,"Increases_the_Max_LV_of_all_Day_and_Night_Market_upgrades_by_+{"],
  172: ["Well_Dressed",2,25,"The_first_MISC_Bonus_on_your_Attire_Equipment_(i.e._Clothing)_gives_}x_more_bonus!"],
  173: ["Divine_Design",1,25,"<._Also,_+{%_Drop_Rate."],
};

/** Pre-computed numeric keys of RES_GRID_RAW (sorted). Avoids repeated Object.keys() in hot loops. */
export const GRID_INDICES = Object.keys(RES_GRID_RAW).map(Number).sort((a, b) => a - b);

export const SHAPE_NAMES = ["Purple Diamond","Blue Circle","Green Microsquare","Cyan Hexagon",
  "Golden Rectangle","Orange Star","Maroon Triangle","White Moon","Pink Heart","Bat Symbol"];
export const SHAPE_BONUS_PCT = [25,15,50,20,20,35,25,30,35,60];
export const SHAPE_COLORS = ["#9b59b6","#3498db","#2ecc71","#00bcd4","#f1c40f","#e67e22","#800000","#ecf0f1","#ff69b4","#555"];
// Goal category for each grid node - used in step-by-step annotations
export const NODE_GOAL = {
  31:'Res EXP', 47:'Stickers', 48:'Polymer', 49:'Polymer',
  50:'Res EXP', 51:'Res EXP', 52:'Kaleido',
  67:'Crowns', 68:'Crowns', 69:'Cogs', 70:'Res True\u00d7', 71:'AFK', 72:'Kaleido',
  87:'Gaming', 88:'Stickers', 89:'Cogs', 90:'Res EXP', 91:'Insight', 92:'Insight', 93:'Obs\u00d7Insight', 94:'Res EXP',
  107:'Crowns', 108:'Rat King', 109:'Artifacts', 110:'Res EXP', 111:'AFK', 112:'Res EXP',
  127:'Sigils', 128:'Sigils', 129:'Minehead', 130:'Class EXP', 131:'Class EXP', 132:'Class EXP',
  146:'Minehead', 147:'Minehead', 148:'Minehead', 149:'Glimbo', 150:'Masterclass', 151:'Spelunking', 152:'Class EXP',
  167:'Minehead', 168:'DR Multi', 169:'Glimbo', 170:'All Quick', 171:'Day/Nite', 172:'Clothing', 173:'Drop Rate',
};
export const NODE_GOAL_COLORS = {
  'Res EXP':'var(--green)', 'Res True\u00d7':'#ff6b6b', 'Obs\u00d7Insight':'var(--gold)',
  'Insight':'var(--purple)', 'Kaleido':'var(--cyan)', 'Rolls':'#aaa', 'AFK':'#888',
};

export const SHAPE_VERTICES = [
  [[16,0],[32,29],[16,59],[0,30]],
  [[29,0],[45,5],[55,16],[58,28],[54,44],[47,52],[31,58],[15,54],[4,44],[0,30],[3,16],[14,4]],
  [[1,1],[31,1],[31,31],[1,31]],
  [[17,0],[58,0],[75,33],[58,67],[17,67],[0,34]],
  [[0,0],[111,0],[111,80],[0,80]],
  [[42,0],[53,26],[83,29],[63,50],[71,80],[42,67],[12,80],[20,50],[0,29],[30,26]],
  [[110,0],[141,63],[0,58]],
  [[62,0],[92,8],[103,21],[67,18],[46,30],[35,52],[37,82],[48,99],[71,109],[102,105],[100,113],[86,122],[65,127],[40,123],[20,110],[5,90],[0,70],[2,45],[15,22],[36,6]],
  [[20,0],[31,3],[35,7],[39,3],[50,0],[63,5],[70,19],[64,34],[35,63],[4,32],[0,18],[7,5]],
  [[14,0],[33,10],[40,0],[47,11],[55,11],[62,0],[69,10],[88,0],[102,25],[99,30],[102,34],[89,60],[57,45],[51,54],[45,45],[13,60],[0,34],[3,30],[0,25]]
];
export const SHAPE_DIMS = [[33,60],[59,59],[33,33],[76,68],[111,83],[84,82],[142,64],[104,128],[71,64],[103,61]];

export const OCC_DATA = [
  {name:"Bored_Tree",roll:1,rollReq:1},{name:"Shopping_Oyster",roll:3,rollReq:30},{name:"Bridge_Plank",roll:5,rollReq:50},
  {name:"Carrot_Patch",roll:6,rollReq:60},{name:"Salty_Seawebs",roll:8,rollReq:70},{name:"Dogbone_Tombstone",roll:10,rollReq:75},
  {name:"Ominous_Signage",roll:11,rollReq:80},{name:"Canyon_Pointerino",roll:13,rollReq:82},{name:"Corange_Coral",roll:15,rollReq:85},
  {name:"Oasis_Erosion",roll:17,rollReq:90},{name:"Barnacle_Brothers",roll:20,rollReq:92},{name:"Green_Shallowrock",roll:22,rollReq:93},
  {name:"Broken_Spacerocks",roll:24,rollReq:93},{name:"Meenie_Cactus",roll:27,rollReq:94},{name:"Coraltree_Branch",roll:30,rollReq:95},
  {name:"Useless_Anchor",roll:31,rollReq:95},{name:"Oboe_Coral_Trio",roll:34,rollReq:96},{name:"Spadespire",roll:37,rollReq:96},
  {name:"Seaswept_Ruins",roll:40,rollReq:97},{name:"Tetrino_Stones",roll:42,rollReq:97},{name:"Stalagtite",roll:45,rollReq:97},
  {name:"OG_Secret_Rock",roll:48,rollReq:98},{name:"Happy_Piggy",roll:50,rollReq:98},{name:"Treeception",roll:52,rollReq:99},
  {name:"Keymaster",roll:55,rollReq:100},{name:"Space_Drip",roll:57,rollReq:100},{name:"Coralcave_Coral",roll:60,rollReq:100},
  {name:"Unblinking_Eye",roll:63,rollReq:100},{name:"Monster_Decoy",roll:66,rollReq:101},{name:"Standard_Stump",roll:70,rollReq:101},
  {name:"Big_Ol_Reef",roll:72,rollReq:101},{name:"Oasis_Palm",roll:74,rollReq:101},{name:"Stalagmite",roll:76,rollReq:102},
  {name:"Rope_Lamp",roll:78,rollReq:102},{name:"Unremarkable_Rock",roll:80,rollReq:102},{name:"Standard_Mine",roll:82,rollReq:103},
  {name:"Ancient_Chainrope",roll:84,rollReq:103},{name:"Birchtree_Bitty",roll:87,rollReq:104},{name:"Unreachable_Grate",roll:90,rollReq:104},
  {name:"Genuine_Deadwood",roll:92,rollReq:104},{name:"Rifty_Crystals",roll:94,rollReq:105},{name:"Pirate_Flag",roll:97,rollReq:105},
  {name:"Happy_Tree",roll:100,rollReq:105},
];

// Static data from game code
export const MINEHEAD_BONUS_QTY = [10,2,1,40,1,100,50,1,2,80,3,11,1,30,2,10,20,5,1,25,1,2,50,23,24,25,26,27,28,29,30,31];
export const STICKER_BASE = [10,5,15,250,40,30,60,1,1,1,1,1]; // Research[25]
export const DANCING_CORAL_BASE = [2,5,3,4,3,1,1,1,1]; // Spelunky[24] parsed digits
export const N2L = '_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ肥肢肖肋肉職耐者箱管算箔策答筒筍白発癒痛痕病疾疲潤潜漬漠演漏漁滞毎殻殺段殖残歳歯歩武歓欲次欠櫛機色村材杉本末未木授掃捧彼役影彫彩胃堪城坑努助加功力創割借候倒老個景是明昇早既掴担想扉戻懸懲憩態感蛮蛍虫虚蘇薬薄蔵';
export const CARD_BASE_REQ = { w7b1: 100000, w7b4: 900000, w7b11: 20000000, Crystal3: 10 };
export const ARENA_THRESHOLDS = [2,5,8,12,15,20,25,35,50,65,80,100,125,150,175,200];
export const GODS_TYPE = [0,2,7,3,5,4,6,1,8,9]; // GodsInfo[godIdx][13]
// SummonEnemies[9]: 40-entry endless bonus types (1-indexed)
export const SUMMON_ENDLESS_TYPE = [21,22,23,24,25,27,23,22,24,29,25,26,24,23,22,32,30,31,25,24,26,29,24,22,21,23,31,28,27,24,26,22,30,25,29,28,23,26,24,32];
export const SUMMON_ENDLESS_VAL  = [1,3,1,12,1,7,2,4,15,3,1,4,18,2,4,3,2,2,2,20,5,4,24,4,1,2,3,5,9,26,5,5,3,1,5,8,2,6,30,3];
// SummonEnemies normal wins: mob name  [bonusType(1-indexed), bonusValue]
export const SUMMON_NORMAL_BONUS = {mushG:[1,15],frogG:[2,30],poopSmall:[6,15],branch:[3,4],beanG:[1,16],ratB:[4,15],slimeG:[5,0.3],mushR:[7,10],acorn:[6,20],snakeG:[2,35],carrotO:[3,5],goblinG:[4,20],plank:[8,10],frogBIG:[5,0.3],mushW:[1,19],poopD:[6,25],jarSand:[9,5],mimicA:[7,15],crabcake:[10,2],coconut:[2,40],sandcastle:[8,15],pincermin:[7,25],potato:[3,6],steak:[5,0.3],moonman:[11,10],sandgiant:[4,20],snailZ:[1,25],sheep:[12,1],flake:[9,10],stache:[6,30],bloque:[1,30],mamoth:[8,15],snowball:[13,10],penguin:[2,50],thermostat:[4,20],glass:[10,3],snakeB:[14,30],speaker:[15,10],eye:[7,30],ram:[5,0.3],skele2:[11,15],mushP:[16,50],w4a2:[9,15],w4a3:[1,35],demonP:[3,6],w4b2:[12,2],w4b1:[6,35],w4b3:[8,20],w4b4:[13,15],w4b5:[1,50],w4c1:[2,75],w4c2:[4,25],w4c3:[10,5],w4c4:[14,60],w5a1:[17,30],w5a2:[15,10],w5a3:[1,40],w5a4:[5,0.3],w5a5:[11,25],w5b1:[16,90],w5b2:[7,30],w5b3:[18,25],w5b4:[9,25],w5b5:[3,7],w5b6:[6,25],w5c1:[4,15],w5c2:[10,10],w6a1:[19,3],w6a2:[2,50],w6a3:[8,20],w6a4:[12,2],w6a5:[14,80],w6b1:[13,20],w6b2:[1,60],w6b3:[16,120],w6b4:[5,0.3],w6c1:[15,20],w6c2:[17,50],w6d1:[3,8],w6d2:[18,70],w6d3:[20,3],Pet1:[1,8],Pet2:[2,15],Pet3:[3,3],Pet0:[6,7],Pet4:[4,15],Pet6:[2,25],Pet5:[1,12],Pet10:[5,0.3],Pet11:[3,4],w7a1:[1,250],w7a2:[4,17],w7a3:[10,5],w7a4:[12,3],w7a5:[1,350],w7a6:[17,250],w7a7:[4,20],w7a8:[14,300],w7a9:[20,1],w7a10:[1,500],w7a11:[4,23],w7a12:[11,90],w7b1:[1,400],w7b2:[9,80],w7b3:[16,150],w7b4:[11,70],w7b5:[17,200],w7b6:[1,500]};
// DeathNoteMobs per world: [klaIndex, killReq] per mob
export const DN_MOB_DATA = [
  [[1,21],[17,0],[2,25],[14,50],[16,60],[19,90],[24,120],[26,130],[27,30],[28,0],[8,20000],[15,35000],[13,2500],[18,5000],[31,0]],
  [[51,100],[52,120],[53,150],[57,200],[58,250],[59,300],[60,500],[62,1000],[63,2000],[64,3000],[65,1]],
  [[101,1000],[103,2000],[104,3000],[105,4000],[106,6000],[107,8000],[108,11000],[109,15000],[110,18000],[111,22000],[112,35000],[113,120000],[116,250000],[117,0]],
  [[151,5000],[152,12000],[153,18000],[154,25000],[155,40000],[156,60000],[157,90000],[158,120000],[159,150000],[160,190000],[161,250000],[162,300000],[163,350000]],
  [[201,15000],[202,25000],[203,40000],[204,50000],[205,75000],[206,100000],[207,200000],[208,300000],[209,450000],[210,600000],[211,1000000],[212,3000000],[213,60000]],
  [[251,30000],[252,50000],[253,100000],[254,250000],[255,400000],[256,1100000],[257,3200000],[258,8000000],[259,12000000],[260,25000000],[261,70000000],[262,100000000],[263,150000000],[264,100]],
  [[301,100000],[302,250000],[303,10000000],[304,5000000],[305,20000000],[306,0],[307,250000000],[308,60000000],[309,0],[310,500000000],[311,1000000000],[312,0],[315,2000000],[316,6000000],[317,1000000000],[318,60000000],[319,125000000],[320,250000000]]
];
// EmperorBon static data: [1]=bonus value by TYPE (12 entries), [2]=maps slotbonus type index (48 entries)
export const EMPEROR_BON_VAL_BY_TYPE = [30,5,20,1,5,15,5,50,1,5,5,10];
export const EMPEROR_BON_TYPE = [0,1,0,2,1,4,0,2,4,3,1,0,2,4,5,0,1,2,4,0,6,5,4,2,7,0,1,3,5,4,11,8,0,7,6,9,2,1,7,10,4,5,7,6,0,2,11,1];
export const EMPEROR_SET_BONUS_VAL = 20; // EquipmentSets.EMPEROR_SET[3][2]
// RANDOlist[90]: shinyTypeIndex  bonus category key
export const SHINY_TYPE_TO_CAT = [0,16,3,5,15,20,0,1,3,4,10,22,2,3,13,19,16,6,5,22,21,20,7,12,15,3,8,0,23,9,22,4,21,5,1,13,3,2,24,16,14,17,25,6,4,15,24,7,18,21,5,3,0,9,24,1,6,2,4,23,16,24,25,7,5,8,9,20,16,1];
// RANDOlist[92]: bonus per shiny level for each category (indexed by shinyTypeIndex, not category)
export const SHINY_BONUS_PER_LV = [1,3,2,2,2,1,1,1,2,1,2,20,2,2,2,1,3,3,1,20,2,1,2,1,2,2,2,1,1,2,20,1,2,1,1,2,2,2,1,3,2,3,1,2,1,2,1,2,1,2,1,2,1,2,1,1,2,2,1,1,3,1,1,2,1,2,2,1,3,1];
// PetStats[world][pet][5] = shinyTypeIndex per pet
export const PET_SHINY_TYPE = [
  [1,2,3,4,5,6,8,9,11,13,16,19,22,28,33,38,44],
  [7,10,12,14,15,17,18,19,20,24,26,30,35,46,53,60,62],
  [21,23,25,27,29,31,32,34,36,37,39,40,43,51,54,58,61,64],
  [38,41,42,45,47,48,49,50,52,55,56,57,59,63,65,66]
];
// NinjaInfo[41] base bonus values per meritoc option (28 options)
export const MERITOC_BASE = [0,700,150,200,400,200,900,200,200,100,125,100,9900,200,100,900,100,200,200,200,50,40,60,30,200,200,50,150];
// LegendTalents bonus per point for specific indices
export const LEGEND_TALENT_PER_PT = { 21: 3, 24: 20, 28: 15, 29: 20 };
// ArcadeShopInfo decay params: [base, denom]
export const ARCADE_SHOP = { 51: ['add', 0.2, 0], 53: ['decay', 100, 100], 59: ['decay', 10, 100], 62: ['decay', 25, 100], 63: ['decay', 20, 100] };
// ArcaneUpg bonus per level for flat indices and multiplied indices
export const ARCANE_FLAT_SET = new Set([3,7,8,10,13,16,20,25,26,28,33,35,39,40,43,45,48,57,58]);
// HolesInfo static data for measurements
export const HOLES_MEAS_BASE = ['45TOT','2','10','6','80TOT','11','13','60TOT','30','40TOT','10','5TOT','30TOT','10TOT','18','50TOT'];
export const HOLES_MEAS_TYPE = [3,4,6,8,1,7,2,8,3,0,9,4,2,6,7,10];
export const HOLES_BOLAIA_PER_LV = [10,2,5,3,20,100,1,5,1,50,25,5,1,5,30];
export const HOLES_MON_BONUS = '2 4 10 1 8 2 1 1 50 250 2 4 500 1 5 2 1 300 50 250 2 3 2 1 4 2 100 35 50 250'.split(' ').map(Number);
export const HOLES_JAR_BONUS_PER_LV = { 23: 1, 30: 1 };
export const COSMO_UPG_BASE = { '0_0': 25, '1_3': 25 };
// ArtifactInfo[32][3] = base bonus
export const ARTIFACT_BASE = { 32: 25 };
// GetSetBonus for GODSHARD_SET
export const GODSHARD_SET_BONUS = 15;

// ===== LAB MAINFRAME DATA =====
// LabMainBonus: [x, y, range, inactiveVal, activeVal, name]
export const LAB_BONUS_BASE = [
  [91,353,90,0,1,'Animal_Farm'],       // 0
  [250,310,90,1,2,'Wired_In'],         // 1
  [356,147,90,1,3,'Gilded_Cyclical'],  // 2
  [450,220,90,0,1,'No_Bubble'],        // 3
  [538,362,90,1,2,'Killers_Brightside'],// 4
  [651,200,90,0,1,'Shrine_World'],     // 5
  [753,113,90,1,5,'Viaduct_Gods'],     // 6
  [824,377,90,1,2,'Certified_Stamp'],  // 7
  [945,326,90,1,1.5,'Spelunker_Obol'],  // 8
  [990,148,90,0,2,'Fungi_Finger'],     // 9
  [1177,163,90,1,2,'Chemistry_Set'],   // 10
  [1300,380,90,0,2,'Banking_Fury'],    // 11
  [400,390,90,0,1,'Sigils_Alchemy'],   // 12
  [1430,265,90,0,50,'Viral_Connection'],// 13
];
// Dynamic entries from NinjaInfo[25-28], require EmporiumBonus(8-11)
export const LAB_BONUS_DYNAMIC = [
  [1530,105,90,0,50,'Artifact_Attraction',8], // 14, req Emp(8)
  [1630,365,90,0,25,'Slab_Sovereignty',9],    // 15, req Emp(9)
  [1790,250,90,0,50,'Spiritual_Growth',10],   // 16, req Emp(10)
  [1950,195,90,0,30,'Depot_Studies_PhD',11],  // 17, req Emp(11)
];
// JewelDesc: [x, y, baseBonus, name]
export const JEWEL_DESC = [
  [76,134,1.5,'Amethyst_Rhinestone'],    // 0
  [164,412,0.5,'Purple_Navette'],        // 1
  [163,218,40,'Purple_Rhombol'],         // 2
  [246,110,3,'Sapphire_Rhinestone'],     // 3
  [277,394,3,'Sapphire_Navette'],        // 4
  [470,294,25,'Sapphire_Rhombol'],       // 5
  [490,112,2,'Sapphire_Pyramite'],       // 6
  [552,163,2,'Pyrite_Rhinestone'],       // 7
  [646,407,3,'Pyrite_Navette'],          // 8
  [680,319,30,'Pyrite_Rhombol'],         // 9  (MF 109)
  [847,105,10,'Pyrite_Pyramite'],        // 10
  [998,404,28,'Emerald_Rhinestone'],     // 11
  [1079,233,200,'Emerald_Navette'],      // 12
  [1085,121,1,'Emerald_Rhombol'],        // 13
  [1167,390,1,'Emerald_Pyramite'],       // 14
  [1300,208,30,'Emerald_Ulthurite'],     // 15
  [1365,100,16,'Black_Diamond_Rhinestone'],// 16 (MF 116)
  [1389,408,1,'Black_Diamond_Ulthurite'],// 17
  [1619,203,20,'Pure_Opal_Rhinestone'],  // 18 (MF 118)
  [1846,410,10,'Pure_Opal_Navette'],     // 19 (MF 119)
  [2040,96,10,'Pure_Opal_Rhombol'],      // 20 (MF 120)
  [1815,96,50,'Deadly_Wrath_Jewel'],     // 21
  [1728,421,50,'North_Winds_Jewel'],     // 22
  [2042,410,50,'Eternal_Energy_Jewel'],  // 23
];

// ===== Grid coordinate / name utilities =====

export function gridCoord(idx) {
  const col = idx % GRID_COLS;
  const row = Math.floor(idx / GRID_COLS);
  return String.fromCharCode(65 + col) + (GRID_ROWS - row);
}

export function obsName(i) {
  return OCC_DATA[i] ? OCC_DATA[i].name.replace(/_/g, ' ') : `#${i}`;
}
