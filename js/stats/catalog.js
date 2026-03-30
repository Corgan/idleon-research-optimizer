// ===== CATALOG.JS — System registry =====
import { talent } from './systems/common/talent.js';
import { guild } from './systems/common/guild.js';
import { equipment } from './systems/common/equipment.js';
import { starSign } from './systems/common/starSign.js';
import { achievement } from './systems/common/achievement.js';
import { bundle } from './systems/common/bundle.js';
import { goldenFood } from './systems/common/goldenFood.js';
import { card, cardSet, cardSingle } from './systems/common/cards.js';
import { companion, compMulti } from './systems/common/companions.js';
import { etcBonus } from './systems/common/etcBonus.js';
import { obol } from './systems/w2/obols.js';
import { vault } from './systems/common/vault.js';
import { friend } from './systems/common/friend.js';
import { lukScaling } from './systems/common/stats.js';
import { ola } from './systems/common/ola.js';
import { stamp } from './systems/w1/stamp.js';
import { owl } from './systems/w1/owl.js';
import { alchemy, sigil } from './systems/w2/alchemy.js';
import { postOffice } from './systems/w2/postOffice.js';
import { arcade } from './systems/w2/arcade.js';
import { voting } from './systems/w2/voting.js';
import { prayer } from './systems/w3/prayer.js';
import { setBonus } from './systems/w3/setBonus.js';
import { dream } from './systems/w3/equinox.js';
import { grid, chip } from './systems/w4/lab.js';
import { tome } from './systems/w4/tome.js';
import { shiny } from './systems/w4/breeding.js';
import { shrine } from './systems/w3/construction.js';
import { holes } from './systems/w5/hole.js';
import { winBonus } from './systems/w6/summoning.js';
import { farm } from './systems/w6/farming.js';
import { emperor } from './systems/w6/emperor.js';
import { pristine } from './systems/w6/sneaking.js';
import { legendPTS } from './systems/w7/legend.js';
import { spelunkShop } from './systems/w7/spelunking.js';
import { nametag, premhat, trophy } from './systems/w7/gallery.js';
import { minehead } from './systems/w7/research.js';
import { meritoc } from './systems/w7/meritoc.js';
import { grimoire } from './systems/mc/grimoire.js';
import { arcaneMap } from './systems/mc/tesseract.js';

export default {
  talent, guild, equipment, starSign, achievement, bundle, goldenFood,
  card, cardSet, cardSingle, companion, compMulti, vault, friend,
  lukScaling, ola, etcBonus, obol,
  stamp, owl,
  alchemy, sigil, postOffice, arcade, voting,
  prayer, setBonus, dream,
  grid, chip, tome, shiny,
  shrine, holes,
  winBonus, farm, emperor, pristine,
  legendPTS, spelunkShop, nametag, premhat, trophy, minehead, meritoc,
  grimoire, arcaneMap,
};
