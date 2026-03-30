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
  106: ["The_Maw",4,25,"Unlocks_a_new_island_in_Sailing,_THE_MAW!_Also,_}x_Artifact_Find_Chance."],
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
  166: ["Minehead_Copium",4,15,"If_your_1st_click_is_on_a_depth_charge,_50%_chance_it_wiggles_and_doesn't_count!_Happens_up_to_|_times_per_game._@_Also,_+{%_Minehead_Currency_gain!"],
  167: ["Minehead_Damagio",3,15,"Multiplies_all_damage_you_deal_in_Mr_Minehead's_Depth_Charge_by_}x"],
  168: ["Glimbo_Insider_Trading_Secrets",1,1,"+{%_Drop_Rate_TRUE_Multi_per_100_Glimbo_Trades!_@_Total_Bonus:^x_DR"],
  169: ["Glimbo_BOGO_Offer",2,10,"Some_of_Glimbo's_trades_give_+|_additional_LVs!_This_works_retroactively._Also,_}x_Coin_gain"],
  170: ["All_Quick_All_Done",3,50,"Every_day,_the_first_'All_Quick'_use_at_the_MSA_in_World_3_gives_}x_more_Souls_and_EXP!"],
  171: ["Day_'N'_Nite",4,50,"Increases_the_Max_LV_of_all_Day_and_Night_Market_upgrades_by_+{"],
  172: ["Well_Dressed",2,25,"The_first_MISC_Bonus_on_your_Attire_Equipment_(i.e._Clothing)_gives_}x_more_bonus!"],
  173: ["Divine_Design",1,25,"<._Also,_+{%_Drop_Rate."],
  188: ["Shakin'_It",2,1,"Every_day,_you_get_another_+|_extra_uses_for_ALL_your_shakers_at_the_Sushi_Station!_And_+{%_chance_for_free_use_when_using_Shakers!"],
  189: ["Sushi_Station_Linguistics",4,25,"You_can_now_speak_to_the_knife_found_in_the_map_past_Glimbo_to_play_the_Sushi_Station_game!_Also,_}x_more_Bucks_gained_from_your_Sushi!"],
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
  146:'Minehead', 147:'Minehead', 148:'Minehead', 149:'Glimbo', 166:'Minehead', 150:'Masterclass', 151:'Spelunking', 152:'Class EXP',
  167:'Minehead', 168:'DR Multi', 169:'Glimbo', 170:'All Quick', 171:'Day/Nite', 172:'Clothing', 173:'Drop Rate',
  106:'Artifacts', 188:'Sushi', 189:'Sushi',
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

// Sushi RoG_BonusQTY values: CustomLists.Research[37] (static)
// Each index is unlocked when UniqueSushi > index.
// UniqueSushi = count of consecutive sushi tiers with Sushi[5][tier] >= 0.
export const ROG_BONUS_QTY = [
  100, 30,  2,  2,  2,  1, 30, 50,  1, 30,   // 0-9
  100, 25, 50,  1, 25, 30, 60,  1, 20,  1,   // 10-19
  200,  3,  1,  1,  2, 30, 25, 50, 150, 100,  // 20-29
    1, 50, 100,  4, 50, 300, 1, 40, 25, 200,  // 30-39
    1, 100, 25, 50, 50, 50, 30, 50, 10, 10,   // 40-49
    0,   0,  0,  0,                             // 50-53 unused
];

/** Get RoG bonus value for a given index if unlocked. */
export function rogBonusQTY(idx, uniqueSushi) {
  if (uniqueSushi > idx) return ROG_BONUS_QTY[idx] || 0;
  return 0;
}

// Static data from game code
export const MINEHEAD_BONUS_QTY = [10,2,1,40,1,100,50,1,2,80,3,25,1,30,2,10,20,5,1,25,1,2,50,23,24,25,26,27,28,29,30,31];
export const STICKER_BASE = [10,5,15,250,40,30,60,1,1,1,1,1]; // Research[25]
export const DANCING_CORAL_BASE = [2,5,3,4,3,1,1,1,1]; // Spelunky[24] parsed digits
export const N2L = '_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ肥肢肖肋肉職耐者箱管算箔策答筒筍白発癒痛痕病疾疲潤潜漬漠演漏漁滞毎殻殺段殖残歳歯歩武歓欲次欠櫛機色村材杉本末未木授掃捧彼役影彫彩胃堪城坑努助加功力創割借候倒老個景是明昇早既掴担想扉戻懸懲憩態感蛮蛍虫虚蘇薬薄蔵';
export const CARD_BASE_REQ = {mushG:5,frogG:6,beanG:7,slimeG:8,snakeG:9,Crystal0:3,Crystal1:3,Bandit_Bob:1,Fish5:8,SoulCard1:3,SoulCard2:3,SoulCard3:3,SoulCard4:4,CritterCard1:4,CritterCard2:4,CritterCard3:4,CritterCard4:4,CritterCard5:4,sheep:11,flake:12,stache:13,bloque:14,mamoth:15,snowball:15,penguin:15,thermostat:15,glass:17,snakeB:17,speaker:17,eye:17,ram:20,skele:15,skele2:15,Starfire:12,Dreadlo:15,Godshard:400,Prehistrium:5000,Tree9:12,Tree10:15,Tree12:15,Tree13:15,Tree14:1000,Fish9:15,Fish10:18,Fish11:24,Fish12:30,Bug9:12,Bug10:15,Bug12:15,Bug13:15,Bug14:1000,CritterCard6:5,CritterCard7:6,CritterCard8:7,CritterCard9:9,CritterCard10:12,CritterCard11:50,SoulCard5:5,SoulCard6:7,SoulCard7:7,SoulCard8:250,SpelunkingCard0:100,SpelunkingCard1:300,SpelunkingCard2:3000,SpelunkingCard3:40000,SpelunkingCard4:150000,SpelunkingCard5:2500000,luckEvent1:5,luckEvent2:5,mushP:15,w4a2:17,w4a3:18,demonP:19,w4b2:20,w4b1:21,w4b3:22,w4b4:23,w4b5:24,w4c1:26,w4c2:27,w4c3:28,w4c4:30,w5a1:25,w5a2:28,w5a3:32,w5a4:35,w5a5:45,w5b1:48,w5b2:52,w5b3:60,w5b4:65,w5b5:70,w5b6:75,w5c1:80,w5c2:100,caveB:5000,caveC:10000,Crystal4:15,w6a1:50,w6a2:60,w6a3:75,w6a4:85,w6a5:100,w6b1:150,w6b2:170,w6b3:200,w6b4:250,w6c1:400,w6c2:500,w6d1:900,w6d2:1300,w6d3:2500,Crystal5:5000,w7a1:5000,w7a2:7000,w7a3:8500,w7a4:11000,w7a5:15000,w7a6:25000,w7a7:35000,w7a8:65000,w7a9:100000,w7a10:150000,w7a11:250000,w7a12:400000,w7b1:100000,w7b2:300000,w7b3:500000,w7b4:900000,w7b5:1500000,w7b6:3500000,w7b7:6000000,w7b8:10000000,w7b9:20000000,w7b10:30000000,w7b11:20000000,w7b12:100000000,Crystal6:2500000,frogD:2,frogY:2,frogR:2,frogW:3,frogGG:5,frogGR4:1,target:2,rocky:2,steakR:2,totem:2,cactus:2,potatoB:5,iceknight:8,iceBossZ:2,slimeB:2,poopD:1,Boss2C:11,mini3a:5,Boss3C:12,mini4a:5,Boss4A:2,Boss4B:2,Boss4C:4,mini5a:4,Boss5A:3,Boss5B:4,Boss5C:5,mini6a:5,Boss6A:6,Boss6B:9,Boss6C:13,ghost:2,slimeR:2,sheepB:3,snakeY:3,shovelY:4,crabcakeB:4,SummerEvent1:8,SummerEvent2:8,xmasEvent3:1,springEvent1:1,springEvent2:1,fallEvent1:3,anni4Event1:4,cropfallEvent1:6,xmasEvent4:1}; // default = 10
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
// NinjaInfo[41] base bonus values per meritoc option (28 options)
export const MERITOC_BASE = [0,700,150,200,400,200,900,200,200,100,125,100,9900,200,100,900,100,200,200,200,50,40,60,30,200,200,50,150];
// LegendTalents bonus per point: LegendTalents[idx][2]
// Full table: 0:30,1:500,2:100,3:10,4:40,5:10,6:25,7:10,8:100,9:2,10:25,11:15,
//   12:100,13:1,14:100,15:150,16:200,17:5,18:2,19:75,20:75,21:15,22:25,23:8,
//   24:20,25:500,26:200,27:50,28:15,29:20,30:25,31:150,32:900,33:75,34:100,
//   35:1,36:3,37:2000,38:1
// We only include indices currently referenced by our code.
export const LEGEND_TALENT_PER_PT = { 1: 500, 7: 10, 10: 25, 20: 75, 21: 15, 22: 25, 24: 20, 25: 500, 26: 200, 28: 15, 29: 20, 36: 3 };
// ArcadeShopInfo decay params: [base, denom]
export const ARCADE_SHOP = { 27: ['decay', 30, 100], 51: ['add', 0.2, 0], 53: ['decay', 100, 100], 54: ['decay', 10, 100], 59: ['decay', 10, 100], 62: ['decay', 25, 100], 63: ['decay', 20, 100], 67: ['decay', 25, 100] };

// ===== GALLERY / NAMETAG / PREMHAT DATA =====
// Nametag tier scale: tierScale[min(4, level - 1)]
export const NAMETAG_TIER_SCALE = [1, 1.6, 2, 2.3, 2.5];
// GamingPalette[28]: Violet, type=1 (decay), base=6, denom=25
export const PALETTE_28 = { base: 6, denom: 25, type: 'decay' };
// MarketExoticInfo[48]: PRISMA_PETAL, type=1 (decay), base=2
export const EXOTIC_48 = { base: 2, farmSlot: 68, type: 'decay', denom: 1000 };
// MarketExoticInfo[49]: EXALTED_ELDOU, type=1 (decay), base=2
export const EXOTIC_49 = { base: 2, farmSlot: 69, type: 'decay', denom: 1000 };
// GamingPalette[23]: Honey_Yellow, type=1 (decay), base=8, denom=25
export const PALETTE_23 = { base: 8, denom: 25, type: 'decay' };
// CompassUpg[76]: Spire_of_Dust, perLevel=1, type=0 (standard)
export const COMPASS_UPG_76 = { perLevel: 1 };
// ArcaneUpg bonus per level for flat indices and multiplied indices
export const ARCANE_FLAT_SET = new Set([3,7,8,10,13,16,20,25,26,28,33,35,39,40,43,45,48,57,58]);
// ArcaneUpg[idx][5] = per-level bonus value from CustomLists.ArcaneUpg
export const ARCANE_PER_LEVEL = [
  1,1,1,1,1,5,3,2,1,2,  // 0-9
  1,2,2,1,1,4,2,2,1,5,  // 10-19
  2,1,3,5,3,1,1,2,1,3,  // 20-29
  1,4,1,1,1,3,6,1,8,1,  // 30-39
  1,3,6,5,6,1,8,1,1,1,  // 40-49
  10,1,12,10,1,8,2,1,1, // 50-58
];
// HolesInfo static data for measurements
export const HOLES_MEAS_BASE = ['45TOT','2','10','6','80TOT','11','13','60TOT','30','40TOT','10','5TOT','30TOT','10TOT','18','50TOT'];
export const HOLES_MEAS_TYPE = [3,4,6,8,1,7,2,8,3,0,9,4,2,6,7,10];
export const HOLES_BOLAIA_PER_LV = [10,2,5,3,20,100,1,5,1,50,25,5,1,5,30];
export const HOLES_MON_BONUS = '2 4 10 1 8 2 1 1 50 250 2 4 500 1 5 2 1 300 50 250 2 3 2 1 4 2 100 35 50 250'.split(' ').map(Number);
export const HOLES_JAR_BONUS_PER_LV = { 23: 1, 30: 1 };
export const COSMO_UPG_BASE = { '0_0': 25, '1_3': 25, '2_3': 6 };
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

// ===== GOLDEN FOOD & BONUS TABLES =====
// Static data extracted from game source (N.formatted.js) for bonus formulas.

// ---------- Bribe bonus values (BribeDescriptions[idx][5]) ----------
export const BRIBE_VALUES = [
  8,    // 0  Insider_Trading (StampCostPct)
  15,   // 1  Tracking_Chips (StampDrop)
  7,    // 2  Mandatory_Fire_Sale (ShopCostPct)
  5,    // 3  Sleeping_on_the_Job (FightAfkRate)
  10,   // 4  Artificial_Demand (ShopSellPct)
  0,    // 5  The_Art_of_the_Deal (BribeExpansion)
  20,   // 6  Overstock_Regulations (ShopQtyPct)
  2.2,  // 7  Double_Exp_Scheme (AfkDoubleEXP)
  20,   // 8  Tagged_Indicators (StampDrop)
  0.2,  // 9  Fossil_Fuel_Legislation (OilConsume)
  20,   // 10 Five_Aces_in_the_Deck (CardDropPct)
  3,    // 11 Fake_Teleport_Tickets (FreeTeleport)
  0,    // 12 The_Art_of_the_Steal (BribeExpansion)
  2,    // 13 Counterfeit_Telepassports (FreeTeleport2)
  10,   // 14 Weighted_Marbles (ArcadeBallz)
  1,    // 15 Changing_the_Code (BubbleSlot)
  4,    // 16 Taxidermied_Cog_Pouches (CogInve)
  10,   // 17 Guild_VIP_Fraud (BonusType)
  4,    // 18 Library_Double_Agent (BonusType)
  0,    // 19 The_Art_of_the_Fail (BribeExpansion)
  2,    // 20 Photoshopped_Dmg_Range (TotalDmg)
  2,    // 21 Glitched_Acc_Formula (TotalAcc)
  2,    // 22 Firewalled_Defence (TotalDef)
  5,    // 23 Bottomless_Bags (CarryCap)
  2,    // 24 AFKeylogging (SkillAFK)
  10,   // 25 Guild_GP_Hack (Guild2)
  0,    // 26 The_Art_of_the_Bail (BribeExpansion)
  1,    // 27 Random_Garbage (RandoGarbo)
  1,    // 28 Godlier_Creation (GodlyCreation)
  1,    // 29 Fishermaster (FishingStats)
  2,    // 30 Muscles_on_Muscles (TotalDmgB)
  10,   // 31 Bottle_Service (BottleMore)
  33,   // 32 Star_Scraper (StarTalz)
  0,    // 33 The_Art_of_the_Grail (BribeExpansion)
  20,   // 34 Artifact_Pilfering (New1)
  30,   // 35 Forge_Cap_Smuggling (New2)
  10,   // 36 Gold_from_Lead (New3) — +10% golden food
  20,   // 37 Nugget_Fabrication (New4)
  30,   // 38 Divine_PTS_Miscounting (New5)
  20,   // 39 Loot_Table_Tampering (New6)
  0,    // 40 The_Art_of_the_Flail (BribeExpansion)
];

// ---------- Achievement special return values ----------
export const ACHIEVE_SPECIAL_5 = new Set([4, 27, 37, 44, 107, 109, 117]);
export const ACHIEVE_SPECIAL_20 = new Set([99, 104, 112]);

// ---------- Vault Upgrade per-level bonus (UpgradeVault[idx][5]) ----------
export const VAULT_UPG_PER_LV = {
  79: 1,  // Properly_Funded_Research: +1% Crop Depot bonuses per level
  86: 1,  // 24_Karat_Foods: +1% golden food per level
};
export const VAULT_UPG_SIMPLE = new Set([
  1, 6, 7, 8, 9, 13, 32, 33, 36, 40, 42, 43, 44, 49, 51, 52, 53, 57,
  61, 64, 70, 73, 74, 76, 79, 85, 86, 88, 89, 999
]);

// ---------- Sigil bonus values (SigilDesc[idx][tierColumn]) ----------
// Game has 4 tiers per sigil (cols 3,4,8,10 in SigilDesc). No 5th tier.
export const SIGIL_BONUS = {
  11: [10, 20, 30, 100], // TROVE: drop rate %
  14: [10, 25, 40, 60],  // EMOJI_VEGGIE: golden food %
};

// ---------- Pristine Charm bonuses (NjEQ.NjTrP{idx}[3]) ----------
export const PRISTINE_CHARM_BONUS = {
  14: 50,  // Gumm_Stick: +50% golden food
  17: 25,  // Liqorice_Rolle: +25% bigger bonuses of non-misc stamps
  20: 20,  // Jellypick: +20% stamp doubler bonus
};

// ---------- NinjaInfo[36]: Farm rank upgrade base bonus per rank level ----------
// Source: CustomLists.NinjaInfo[36] from la.NinjaInfo() — static game data.
// Index maps to rank upgrade type (see NinjaInfo[34] for names).
// Game formula for t in {4,9,14,19}: max(1, getbonus2(207)) * (1+exotic14/100) * NINJA_INFO_36[t] * FarmRank[2][t]
export const NINJA_INFO_36 = [250,5,25,600,2,90,200,120,100,10,3000,340,110,520,20,40000,220,600,1500,5];

// ---------- Set bonus values (from EquipmentSets definition, index [3][2]) ----------
export const SET_BONUS_VALUES = {
  SECRET_SET: 25,
  EMPEROR_SET: 20,  // Ribbons and Exalted Stamps give }x more multi
};

// ---------- Voting Bonus Data (NinjaInfo[38]) ----------
export const VOTING_BONUS_VALUES = [
  25, 25, 15, 30, 30, 20, 15, 42, 50, 38, 46, 20, 25, 63, 50, 60, 50, 80,
  40, 53, 31, 80, 75, 60, 50, 65, 30, 38, 40, 40, 54, 90, 40, 50, 52,
];

// ---------- Golden food items ----------
export const GOLD_FOOD_DR = { FoodG13: 8, FoodG15: 2 };

export const EMPORIUM_FOOD_SLOTS = [
  'PeanutG', 'ButterBar', 'FoodG1', 'FoodG2', 'FoodG3', 'FoodG4', 'FoodG5',
  'FoodG6', 'FoodG7', 'FoodG8', 'FoodG9', 'FoodG10', 'FoodG11', 'FoodG12',
  'FoodG13', 'FoodG14', 'FoodG15',
];

export const GOLD_FOOD_INFO = {
  PeanutG:   { effect: 'MiningEff',    amount: 30 },
  ButterBar: { effect: 'BaseAcc',      amount: 60 },
  FoodG1:    { effect: 'MaxHPpct',     amount: 30 },
  FoodG2:    { effect: 'Damage',       amount: 20 },
  FoodG3:    { effect: 'Defence',      amount: 30 },
  FoodG4:    { effect: 'BaseDamage',   amount: 400 },
  FoodG5:    { effect: 'SkillExp',     amount: 18 },
  FoodG6:    { effect: 'MonsterCash',  amount: 30 },
  FoodG7:    { effect: 'FishingEff',   amount: 40 },
  FoodG8:    { effect: 'ShrineEffect', amount: 20 },
  FoodG9:    { effect: 'AllStatz',     amount: 10 },
  FoodG10:   { effect: 'SailAFKz',    amount: 23 },
  FoodG11:   { effect: 'ClassEXPz',   amount: 40 },
  FoodG12:   { effect: 'AllAFK',       amount: 4 },
  FoodG13:   { effect: 'DropRatez',    amount: 8 },
  FoodG14:   { effect: 'SpelunkEXPz',  amount: 1 },
  FoodG15:   { effect: 'DropRatez',    amount: 2 },
};

// ---------- SHIMMERON alchemy bubble (cauldron 0, index 18) ----------
// AlchemyDescription[0][18]: "SHIMMERON 80 40 decay ... GFoodz"
export const SHIMMERON_BUBBLE = { cauldron: 0, index: 18, x1: 80, x2: 40, formula: 'decay' };

// ---------- WARRIORS_RULE bubble (cauldron 0, index 1) → Opassz ----------
// AlchemyDescription[0][1]: "WARRIORS_RULE 2 50 decayMulti ... Opassz"
// Warrior classes (ID 6-17) get cauldron-0 bubbles multiplied by max(1, Opassz).
export const WARRIORS_RULE_BUBBLE = { cauldron: 0, index: 1, x1: 2, x2: 50, formula: 'decayMulti' };

// ---------- ReturnClasses: class ID → ancestor class tree ----------
// Game: ja.ReturnClasses(e). For e < 6: [1..e]. For e >= 6: builds chain from (e-6)%12 tier.
// Pre-computed for all known class IDs relevant to ClassFamilyBonuses[33] (Shaman line).
// Key = class ID, Value = array of class indices in the tree.
// Generated from game's ReturnClasses algorithm (N.formatted.js:66140)
export const CLASS_TREES = {
  1: [1],
  2: [1, 2],
  3: [1, 2, 3],
  4: [1, 2, 3, 4],
  5: [1, 2, 3, 4, 5],
  6: [6],
  7: [6, 7],
  8: [6, 7, 8],
  9: [6, 7, 9],
  10: [6, 7, 8, 10],
  11: [6, 7, 8, 11],
  12: [6, 7, 9, 12],
  13: [6, 7, 9, 13],
  14: [6, 7, 8, 10, 14],
  15: [6, 7, 8, 11, 15],
  16: [6, 7, 9, 12, 16],
  17: [6, 7, 9, 13, 17],
  18: [18],
  19: [18, 19],
  20: [18, 19, 20],
  21: [18, 19, 21],
  22: [18, 19, 20, 22],
  23: [18, 19, 20, 23],
  24: [18, 19, 21, 24],
  25: [18, 19, 21, 25],
  26: [18, 19, 20, 22, 26],
  27: [18, 19, 20, 23, 27],
  28: [18, 19, 21, 24, 28],
  29: [18, 19, 21, 25, 29],
  30: [30],
  31: [30, 31],
  32: [30, 31, 32],
  33: [30, 31, 33],
  34: [30, 31, 32, 34],
  35: [30, 31, 32, 35],
  36: [30, 31, 33, 36],
  37: [30, 31, 33, 37],
  38: [30, 31, 32, 34, 38],
  39: [30, 31, 32, 35, 39],
  40: [30, 31, 33, 36, 40],
  41: [30, 31, 33, 37, 41],
};

// ---------- ClassFamilyBonuses[33]: golden food family bonus ----------
// formula=decayMulti, x1=0.4, x2=100, ClassAccountBonus[33][1]=29
// FamBonusQTYs key = "" + Math.round(2*33+0) = "66"
export const FAMILY_BONUS_33 = { x1: 0.4, x2: 100, formula: 'decayMulti', lvOffset: 29 };

// ---------- Talent 144: +% larger Family Bonuses ----------
// GetTalentNumber(1, 144) = decay(40, 100, effectiveLv)
// Amplifies the active char's own family bonus contributions.
export const TALENT_144 = { x1: 40, x2: 100, formula: 'decay' };

// ---------- Star sign 69 bonus per equipped instance ----------
export const STAR_SIGN_69_BONUS = 20;

// ---------- Items with %_GOLD_FOOD_EFFECT as UQ stat ----------
// Map of item name → { uq: 1|2, baseVal: number }
// Used by etcBonuses8 computation. Only 1 item in the entire game has this stat.
export const ITEMS_WITH_GFOOD_UQ = {
  EquipmentHats2: { uq: 1, baseVal: 15 },  // Royal Turban: UQ1txt=%_GOLD_FOOD_EFFECT, UQ1val=15
};

// ===== DROP RATE CONSTANTS =====

// ---------- Stamp: DropRate (StampA38 = Golden Sixes, ID=37, category 0, index 37) ----------
export const DR_STAMP = { cat: 0, idx: 37, x1: 20, x2: 80, formula: 'decay' };

// ---------- Map kill requirements: MapDetails[m][0][0] from game source ----------
// Used by calcTalentMAP209 to compute killsDone = MAP_KILL_REQS[m] - killsLeft.
export const MAP_KILL_REQS = [1,21,25,150,150,150,10,25,20000,0,40,50,60,2500,50,35000,60,0,5000,90,7,5,0,0,120,0,130,30,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,100,120,150,15,30,30,200,250,300,500,30,1000,2000,3000,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1000,4000,2000,3000,4000,6000,8000,11000,15000,18000,22000,35000,120000,1000,1000,250000,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,5000,12000,18000,25000,40000,60000,90000,120000,150000,190000,250000,300000,350000,250,700,100,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,15000,25000,40000,50000,75000,100000,200000,300000,450000,600000,1000000,3000000,60000,100,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,30000,50000,100000,250000,400000,1100000,3200000,8000000,12000000,25000000,70000000,100000000,150000000,100,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,100000,250000,10000000,5000000,20000000,0,250000000,60000000,0,500000000,1000000000,0,0,0,2000000,6000000,1000000000,60000000,125000000,250000000,350000000,500000000,750000000,1000000000,2000000000,0];

// ---------- Map AFK targets: indices with 'Nothing' or 'Z' are NOT fighting maps ----------
// Used by calcTalentMAP209 to filter to FIGHTING maps only.
// Generated from MapAFKtarget in game source.
const _MAP_AFK = "Nothing mushG frogG JungleZ Nothing Nothing Copper Iron poopSmall poopSmall Plat Void Starfire branch beanG ratB slimeG mushR acorn snakeG Nothing Nothing Nothing Nothing carrotO Nothing goblinG plank frogBIG plank acorn mushW Godshard Z Z Z frogG Nothing poopD frogG frogG Nothing Nothing Z Z Z Z Z Z Z Nothing jarSand mimicA crabcake FishSmall FishSmall Filler coconut sandcastle pincermin potato FishMed steak moonman sandgiant snailZ snailZ Bug2 mimicA sandgiant mimicA mimicA FishMed Nothing Nothing Nothing Nothing Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Nothing sheep Nothing flake stache bloque mamoth snowball penguin thermostat glass snakeB speaker eye eye flake ram skele2 sheep sheep ram Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Nothing mushP w4a2 w4a3 demonP w4b2 w4b1 w4b3 w4b4 w4b5 w4c1 w4c2 w4c3 w4c4 mushP w4c4 riftAll Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Nothing w5a1 w5a2 w5a3 w5a4 w5a5 w5b1 w5b2 w5b3 w5b4 w5b5 w5b6 w5c1 w5c2 w5b6 w5a2 Nothing Nothing Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Nothing w6a1 w6a2 w6a3 w6a4 w6a5 w6b1 w6b2 w6b3 w6b4 w6c1 w6c2 w6d1 w6d2 w6d3 w6a2 w6d3 Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Z Nothing w7a1 w7a2 w7a3 w7a4 w7a5 w7a6 w7a7 w7a8 w7a9 w7a10 w7a11 w7a12 Nothing Nothing w7b1 w7b2 w7b3 w7b4 w7b5 w7b6 w7b7 w7b8 w7b9 w7b10 w7b11 w7b12".split(" ");
export function isFightingMap(mapIdx) {
  const mob = _MAP_AFK[mapIdx];
  return mob && mob !== 'Nothing' && mob !== 'Z';
}

// ---------- Alchemy bubble: DROPPIN_LOADS (cauldron 3, index 1) ----------
export const DR_BUBBLE = { cauldron: 3, index: 1, x1: 40, x2: 70, formula: 'decay' };

// ---------- Talents used in DR formula ----------
export const DR_TALENTS = {
  24:  { x1: 70, x2: 100, formula: 'decay' },   // Curse of Mr Looty Booty: +{}% Drop & -{}% Dmg
  207: { x1: 2, x2: 200, formula: 'decayMulti' }, // Dank Ranks: ×{}x land rank upgrades
  279: { x1: 40, x2: 65, formula: 'decay' },     // Robbinghood: +{}% rarity
  655: { x1: 25, x2: 100, formula: 'decay' },    // Boss Battle Spillover: +{}% per boss diff
  328: { x1: 6, x2: 150, formula: 'decay' },     // Archlord of the Pirates: +{}% EXP and Drop Rate
};

// ---------- Prayer 7 (Midas_Minded): +base% DR, level scales bonus ----------
export const PRAYER_7 = { baseBonus: 20, baseCurse: 250, maxLevel: 50 };

// ---------- Guild bonus 10: Drop Rate, decay formula ----------
export const GUILD_BONUS_10 = { x1: 40, x2: 50, formula: 'decay' };

// ---------- Shrine 4 (Clover_Shrine): base + perLevel ----------
export const SHRINE_4 = { base: 15, perLevel: 3 };

// ---------- Post Office box 11 slot 0: Drop Rate ----------
export const PO_BOX_DR = { box: 11, slot: 0, x1: 50, x2: 200, formula: 'decay' };

// ---------- Star signs with "Drop" bonus ----------
// Map of star sign index → Drop Rate bonus value
export const STAR_SIGNS_DROP = { 14: 5, 76: 12 };

// ---------- Card bonus stat type 10: +{}% Total_Drop_Rate ----------
// Card name → bonus value per star level (CardStuff[cardIdx][6])
export const CARD_DR_BONUS = {
  Crystal0: 5, mimicA: 2, speaker: 3.5, w5a3: 6, w6d2: 8,
  babaMummy: 6, xmasEvent: 3, crabcakeB: 3, Boss6A: 12,
};
// Special cards with passive DR (count towards CardBonusREAL but also capped separately)
export const CARD_DR_PASSIVE = { caveC: 4, mini5a: 1.5 };

// ---------- Card bonus stat type 101: +{}% Drop_Rate_Multi ----------
export const CARD_DR_MULTI = {
  w7a12: 1, w7b7: 1, w7b8: 1, w7b9: 1, w7b10: 1, w7b12: 1,
};

// ---------- Card set bonuses: "5" and "6" ----------
// Cards[3] stores active set bonuses. Index = setId from game's IDforCardSETbonus.
// "5" = {%_Dmg,Drop,EXP (mixed set), "6" = {%_Drop_Rate (DR set)
// The game has ~10 card set tiers per set. Value = Cards[3][setIdx] (precomputed by game).
// We compute it from equipped card counts.
export const CARD_SET_5_IDX = 5;
export const CARD_SET_6_IDX = 6;

// ---------- Vault upgrade 18 (Drops_for_Days): +1 per level ----------
export const VAULT_UPG_DR = { idx: 18, perLevel: 1 };

// ---------- Grimoire upgrade 44 (Skull_of_Major_Droprate): +1 per level ----------
export const GRIMOIRE_UPG_DR = { idx: 44, perLevel: 1 };

// ---------- Spelunky shop upgrade 50 (Golden_Hardhat): +1 per level ----------
export const SPELUNK_SHOP_DR = { idx: 50, perLevel: 1 };

// ---------- Companion bonus values for DR-relevant companions ----------
// Game: CompanionInfo[compId][4] = bonus value (some are multiplicative, see formula)
export const COMPANION_DR_BONUS = {
  3: 10,     // Step 3 additive
  22: 10,    // Step 2 additive
  26: 0.3,   // Step 4 multiplicative (max 1.3)
  50: 25,    // Step 3 additive + Step 4 cap (max 1.01 at /2500)
  111: 15,   // Step 2 additive
  155: 0,    // Not DR-related (already handled elsewhere)
};

// ---------- Legend talent per-point values for DR ----------
// Extending LEGEND_TALENT_PER_PT with DR-specific indices
// 1: LegendTalents[1][2] = 500 (this is DR related)
// 26: LegendTalents[26][2] = 200 (owl bonus multi)

// ---------- Talents used in TotalStats("LUK") ----------
export const LUK_TALENTS = {
  13:  { x1: 1, x2: 0, formula: 'add' },         // Flat LUK per level
  21:  { x1: 220, x2: 250, formula: 'decay' },    // +{}% more LUK from equips
  23:  { x1: 1, x2: 0, formula: 'add' },          // Flat LUK (different tab)
  54:  { x1: 2, x2: 0, formula: 'add' },          // +{} base LUK for ALL characters (max)
  652: { x1: 1, x2: 0, formula: 'add' },          // Flat all stat (outside multiplier)
};

// ---------- Item base LUK values (from ItemDefinitionsGET) ----------
// Only items with LUK > 0 are listed. Extracted from game source.
export const ITEM_BASE_LUK = {
  EquipmentHatsBeg1:10,EquipmentHats5:1,EquipmentHats6:1,EquipmentHats7:2,
  EquipmentHats9:8,EquipmentHats10:4,EquipmentHats12:1,EquipmentHats16:1,
  EquipmentHats4Choppin:4,EquipmentHats21:5,EquipmentHats22:4,EquipmentHats25:3,
  EquipmentHats52:8,EquipmentHats53:12,EquipmentHats54:15,EquipmentHats55:1,
  EquipmentHats61:20,EquipmentHats64:10,EquipmentHats70:22,EquipmentHats71:30,
  EquipmentHats72:50,EquipmentHats74:35,EquipmentHats76:5,EquipmentHats77:40,
  EquipmentHats78:5,EquipmentHats79:5,EquipmentHats83:50,EquipmentHats105:58,
  EquipmentHats106:65,EquipmentHats111:3,EquipmentHats119:80,EquipmentHats123:140,
  EquipmentPunching1:2,EquipmentPunching2:5,EquipmentPunching3:10,EquipmentPunching4:13,
  EquipmentPunching5:17,EquipmentPunching6:21,EquipmentPunching7:30,EquipmentPunching8:40,
  EquipmentPunching9:52,EquipmentPunching10:65,EquipmentPunching11:82,EquipmentPunching12:100,
  EquipmentWeapons1:1,EquipmentBows5:3,EquipmentWands3:1,EquipmentWands7:1,
  EquipmentShirts4:3,EquipmentShirts7:3,EquipmentShirts8:3,EquipmentShirts9:3,
  EquipmentShirts21:3,EquipmentShirts24:3,EquipmentShirts31:25,EquipmentShirts32:16,
  EquipmentShirts33:20,EquipmentShirts34:24,EquipmentShirts35:30,EquipmentShirts36:40,
  EquipmentShirts37:45,EquipmentShirts38:60,EquipmentShirts39:75,EquipmentShirts41:130,
  EquipmentPants7:3,EquipmentPants8:25,EquipmentPants11:3,EquipmentPants12:3,
  EquipmentPants13:3,EquipmentPants14:3,EquipmentPants24:14,EquipmentPants25:18,
  EquipmentPants26:32,EquipmentPants27:45,EquipmentPants29:50,EquipmentPants30:55,
  EquipmentPants31:65,EquipmentPants32:120,
  EquipmentShoes1:2,EquipmentShoes3:3,EquipmentShoes4:5,EquipmentShoes5:7,
  EquipmentShoes6:3,EquipmentShoes7:2,EquipmentShoes8:3,EquipmentShoes10:3,
  EquipmentShoes11:3,EquipmentShoes12:8,EquipmentShoes22:9,EquipmentShoes23:12,
  EquipmentShoes24:13,EquipmentShoes25:17,EquipmentShoes32:20,EquipmentShoes33:30,
  EquipmentShoes34:22,EquipmentShoes35:28,EquipmentShoes36:38,EquipmentShoes37:43,
  EquipmentShoes38:57,EquipmentShoes40:70,EquipmentShoes41:100,
  EquipmentPendant1:1,EquipmentPendant2:1,EquipmentPendant3:2,EquipmentPendant4:2,
  EquipmentPendant5:3,EquipmentPendant7:4,EquipmentPendant8:5,EquipmentPendant11:2,
  EquipmentPendant12:5,EquipmentPendant13:5,EquipmentPendant15:5,EquipmentPendant18:3,
  EquipmentPendant19:3,EquipmentPendant22:3,EquipmentPendant23:3,EquipmentPendant28:10,
  EquipmentPendant29:6,EquipmentPendant30:35,EquipmentPendant33:10,EquipmentPendant35:35,
  EquipmentRings1:3,EquipmentRings2:3,EquipmentRings3:4,EquipmentRings4:3,
  EquipmentRings5:3,EquipmentRings8:1,EquipmentRings13:1,EquipmentRings14:1,
  EquipmentRings15:4,EquipmentRings18:30,EquipmentRings19:7,EquipmentRings27:3,
  EquipmentRings29:3,EquipmentRings35:10,EquipmentRings36:50,EquipmentRings38:7,
  EquipmentRingsChat1:1,EquipmentRingsChat2:1,EquipmentRingsChat3:3,
  EquipmentRingsChat4:1,EquipmentRingsChat5:1,EquipmentRingsChat6:1,
  EquipmentRingsChat8:1,EquipmentRingsChat9:1,EquipmentRingsChat11:20,
  EquipmentCape0:5,EquipmentCape6:10,EquipmentCape11:30,EquipmentCape12:12,
  EquipmentCape13:11,EquipmentCape14:40,EquipmentCape16:50,EquipmentCape17:15,
  EquipmentCape18:30,
};
