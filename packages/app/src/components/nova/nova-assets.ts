// Nova 表情（来自 VCPToolBox/image/Nova表情包，裁成圆形并压缩为 192px WebP）。
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
import type { NovaMood } from "./nova-lottie";

export const NOVA_IMAGES: Record<NovaMood, readonly string[]> = {
  idle: [idleEnergetic, idleEnjoy, idleSmile, idleWatch],
  greet: [greetStart, greetWelcome],
  thinking: [thinkCalc, thinkHard, thinkNotes, thinkTilt],
  talking: [talkAgree, talkFun, talkGreat, talkWow],
  found: [foundEureka, foundJoy, foundStars],
  silent: [silentContent, silentTea],
  error: [errorAggrieved, errorCry, errorStunned],
  sleep: [sleepNap, sleepSleepy],
  paused: [pausedSlack],
  pet: [petBlush, petHeart, petPat, petShy],
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

export function pickNovaImage(mood: NovaMood, seed: number): string {
  const images = NOVA_IMAGES[mood];
  return images[Math.abs(Math.floor(seed)) % images.length] ?? idleEnergetic;
}

/** 收起状态和“只要气泡”模式使用的静态头像。 */
export const NOVA_STATIC_AVATAR = idleEnergetic;

/** 深夜空闲时的困倦表情。 */
export const NOVA_LATE_NIGHT_IMAGE = sleepSleepy;
