// Nova 表情（来自 VCPToolBox/image/Nova表情包，裁成圆形并压缩为 192px WebP；.agent/stickers.py 可重新生成）。
// 以 URL 形式导入：只有用到的表情才会被浏览器加载。
import errorAggrieved from "@/assets/nova/error-aggrieved.webp";
import errorCry from "@/assets/nova/error-cry.webp";
import errorStunned from "@/assets/nova/error-stunned.webp";
import foundEureka from "@/assets/nova/found-eureka.webp";
import foundJoy from "@/assets/nova/found-joy.webp";
import foundStars from "@/assets/nova/found-stars.webp";
import greetStart from "@/assets/nova/greet-start.webp";
import greetWelcome from "@/assets/nova/greet-welcome.webp";
import idleEnergetic from "@/assets/nova/idle-energetic.webp";
import idleEnjoy from "@/assets/nova/idle-enjoy.webp";
import idleSmile from "@/assets/nova/idle-smile.webp";
import idleWatch from "@/assets/nova/idle-watch.webp";
import pausedSlack from "@/assets/nova/paused-slack.webp";
import petBlush from "@/assets/nova/pet-blush.webp";
import petHeart from "@/assets/nova/pet-heart.webp";
import petPat from "@/assets/nova/pet-pat.webp";
import petShy from "@/assets/nova/pet-shy.webp";
import silentContent from "@/assets/nova/silent-content.webp";
import silentTea from "@/assets/nova/silent-tea.webp";
import sleepNap from "@/assets/nova/sleep-nap.webp";
import sleepSleepy from "@/assets/nova/sleep-sleepy.webp";
import talkAgree from "@/assets/nova/talk-agree.webp";
import talkFun from "@/assets/nova/talk-fun.webp";
import talkGreat from "@/assets/nova/talk-great.webp";
import talkWow from "@/assets/nova/talk-wow.webp";
import thinkCalc from "@/assets/nova/think-calc.webp";
import thinkHard from "@/assets/nova/think-hard.webp";
import thinkNotes from "@/assets/nova/think-notes.webp";
import thinkTilt from "@/assets/nova/think-tilt.webp";
import idleShow from "@/assets/nova/idle-show.webp";
import idleMelon from "@/assets/nova/idle-melon.webp";
import idleRub from "@/assets/nova/idle-rub.webp";
import idleLibrary from "@/assets/nova/idle-library.webp";
import idleSoda from "@/assets/nova/idle-soda.webp";
import idleMilktea from "@/assets/nova/idle-milktea.webp";
import idleHome from "@/assets/nova/idle-home.webp";
import greetSalute from "@/assets/nova/greet-salute.webp";
import greetPopup from "@/assets/nova/greet-popup.webp";
import greetGo from "@/assets/nova/greet-go.webp";
import greetCheer from "@/assets/nova/greet-cheer.webp";
import thinkPuzzled from "@/assets/nova/think-puzzled.webp";
import thinkScratch from "@/assets/nova/think-scratch.webp";
import thinkWise from "@/assets/nova/think-wise.webp";
import thinkCount from "@/assets/nova/think-count.webp";
import thinkLost from "@/assets/nova/think-lost.webp";
import thinkQuestion from "@/assets/nova/think-question.webp";
import talkRoger from "@/assets/nova/talk-roger.webp";
import talkHeart from "@/assets/nova/talk-heart.webp";
import talkWhoa from "@/assets/nova/talk-whoa.webp";
import talkLaugh from "@/assets/nova/talk-laugh.webp";
import talkGiggle from "@/assets/nova/talk-giggle.webp";
import talkRant from "@/assets/nova/talk-rant.webp";
import talkSmirk from "@/assets/nova/talk-smirk.webp";
import talkShowoff from "@/assets/nova/talk-showoff.webp";
import talkVictory from "@/assets/nova/talk-victory.webp";
import talkNod from "@/assets/nova/talk-nod.webp";
import foundExcited from "@/assets/nova/found-excited.webp";
import foundBoss from "@/assets/nova/found-boss.webp";
import foundFlower from "@/assets/nova/found-flower.webp";
import foundHappy from "@/assets/nova/found-happy.webp";
import silentCalm from "@/assets/nova/silent-calm.webp";
import silentShrug from "@/assets/nova/silent-shrug.webp";
import silentDunno from "@/assets/nova/silent-dunno.webp";
import silentSilly from "@/assets/nova/silent-silly.webp";
import errorExplode from "@/assets/nova/error-explode.webp";
import errorGiveup from "@/assets/nova/error-giveup.webp";
import errorPanic from "@/assets/nova/error-panic.webp";
import errorSoul from "@/assets/nova/error-soul.webp";
import errorSigh from "@/assets/nova/error-sigh.webp";
import errorSpeechless from "@/assets/nova/error-speechless.webp";
import sleepNight from "@/assets/nova/sleep-night.webp";
import sleepFaint from "@/assets/nova/sleep-faint.webp";
import sleepBed from "@/assets/nova/sleep-bed.webp";
import sleepStretch from "@/assets/nova/sleep-stretch.webp";
import sleepDrowsy from "@/assets/nova/sleep-drowsy.webp";
import pausedLie from "@/assets/nova/paused-lie.webp";
import pausedBye from "@/assets/nova/paused-bye.webp";
import pausedFish from "@/assets/nova/paused-fish.webp";
import pausedWait from "@/assets/nova/paused-wait.webp";
import pausedHide from "@/assets/nova/paused-hide.webp";
import petHug from "@/assets/nova/pet-hug.webp";
import petCover from "@/assets/nova/pet-cover.webp";
import petSteam from "@/assets/nova/pet-steam.webp";
import petLove from "@/assets/nova/pet-love.webp";
import petFeed from "@/assets/nova/pet-feed.webp";
import petTsundere from "@/assets/nova/pet-tsundere.webp";
import type { NovaMood } from "./nova-lottie";

export const NOVA_IMAGES: Record<NovaMood, readonly string[]> = {
  idle: [
    idleEnergetic,
    idleEnjoy,
    idleSmile,
    idleWatch,
    idleShow,
    idleMelon,
    idleRub,
    idleLibrary,
    idleSoda,
    idleMilktea,
    idleHome,
  ],
  greet: [greetStart, greetWelcome, greetSalute, greetPopup, greetGo, greetCheer],
  thinking: [
    thinkCalc,
    thinkHard,
    thinkNotes,
    thinkTilt,
    thinkPuzzled,
    thinkScratch,
    thinkWise,
    thinkCount,
    thinkLost,
    thinkQuestion,
  ],
  talking: [
    talkAgree,
    talkFun,
    talkGreat,
    talkWow,
    talkRoger,
    talkHeart,
    talkWhoa,
    talkLaugh,
    talkGiggle,
    talkRant,
    talkSmirk,
    talkShowoff,
    talkVictory,
    talkNod,
  ],
  found: [foundEureka, foundJoy, foundStars, foundExcited, foundBoss, foundFlower, foundHappy],
  silent: [silentContent, silentTea, silentCalm, silentShrug, silentDunno, silentSilly],
  error: [
    errorAggrieved,
    errorCry,
    errorStunned,
    errorExplode,
    errorGiveup,
    errorPanic,
    errorSoul,
    errorSigh,
    errorSpeechless,
  ],
  sleep: [sleepNap, sleepSleepy, sleepNight, sleepFaint, sleepBed, sleepStretch, sleepDrowsy],
  paused: [pausedSlack, pausedLie, pausedBye, pausedFish, pausedWait, pausedHide],
  pet: [petBlush, petHeart, petPat, petShy, petHug, petCover, petSteam, petLove, petFeed, petTsundere],
};

/** 按文件名（不含扩展名）取表情，供 Jev 选表情时使用。 */
export const NOVA_IMAGE_BY_NAME: Record<string, string> = {
  "talk-agree": talkAgree,
  "talk-fun": talkFun,
  "talk-great": talkGreat,
  "talk-wow": talkWow,
  "found-eureka": foundEureka,
  "found-joy": foundJoy,
  "found-stars": foundStars,
  "think-hard": thinkHard,
  "think-tilt": thinkTilt,
  "error-cry": errorCry,
  "error-aggrieved": errorAggrieved,
  "error-stunned": errorStunned,
};

/** Jev 选中的表情可以在几张相近的表情里轮换，避免每次都是同一张。 */
export const NOVA_IMAGE_VARIANTS: Record<string, readonly string[]> = {
  "talk-agree": [talkAgree, talkNod, talkRoger, talkHeart],
  "talk-fun": [talkFun, talkLaugh, talkGiggle, talkSmirk],
  "talk-great": [talkGreat, talkVictory, foundBoss, foundFlower],
  "talk-wow": [talkWow, talkWhoa, foundExcited],
  "found-eureka": [foundEureka, thinkWise],
  "found-joy": [foundJoy, foundHappy, petLove],
  "found-stars": [foundStars, foundExcited, foundFlower],
  "think-hard": [thinkHard, thinkScratch, thinkPuzzled, thinkLost],
  "think-tilt": [thinkTilt, thinkQuestion, talkRant],
  "error-cry": [errorCry, errorSigh],
  "error-aggrieved": [errorAggrieved, talkRant, errorSpeechless],
  "error-stunned": [errorStunned, errorSoul, errorExplode],
};

export function pickReactionImage(name: string, seed: number): string | undefined {
  const variants = NOVA_IMAGE_VARIANTS[name];
  if (!variants || variants.length === 0) return NOVA_IMAGE_BY_NAME[name];
  return variants[Math.abs(Math.floor(seed)) % variants.length];
}

export function pickNovaImage(mood: NovaMood, seed: number): string {
  const images = NOVA_IMAGES[mood];
  return images[Math.abs(Math.floor(seed)) % images.length] ?? idleEnergetic;
}

/** 收起状态和“只要气泡”模式使用的静态头像。 */
export const NOVA_STATIC_AVATAR = idleEnergetic;

/** 深夜空闲时的困倦表情。 */
export const NOVA_LATE_NIGHT_IMAGE = sleepSleepy;
