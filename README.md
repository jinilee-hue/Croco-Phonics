# Croco Phonics (악어 이빨 파닉스)

두 명이 번갈아 악어 이빨을 누르는 파닉스 보드게임. 단어는 모두 **FPR K · Unit 1 · Lesson 1(교재 p.9–20)** 에 나오는 m 단어.

## 규칙
1. 라운드가 시작되면 m 단어 하나가 **지시 단어**로 나온다(화면 위 카드 · 빨간 '깨물기' 배지). 음가 /m/ + 단어를 들려준다.
2. 이빨 8개에 Lesson 1 m 단어가 하나씩 숨어 있고, 그중 하나가 지시 단어다.
3. 이빨을 누르면 → 그림카드가 튀어나오고 → **/m/ 음가 + 단어**를 들려주고 → "Now say the word." → 마이크로 아이 목소리가 들리면 칭찬 → 카드는 누른 사람 쪽에 쌓이고 → 상대 턴.
4. 지시 단어가 숨은 이빨을 누르면 이빨이 보라색으로 빛나고 악어가 **덥석!** 그 사람이 지고, 상대가 이긴다.
5. Play Again → 새 지시 단어로 다음 판(진 사람이 먼저).

## 단어 (12개 · `tools/build_words.py`)
man, map, meat, milk, mirror, mitt, monkey, moon, mop, mouse, mug, mushroom
- 출처: SAD·FPR 단어 연구 자료집 `~/dev/sadfpr-studio/data/b2_book_FPRK.json` 의 Lesson 1 쪽(p.9–20) 행.
- 뺀 단어: **my** — p.11에 글자로만 나오는 기능어라 그림카드로 보여줄 수 없음.
- 그림카드는 Magic Block(Phonics-Jenga)과 같은 FPR K 그림.

## 실행
- `실행.command` 더블클릭 → http://127.0.0.1:5211/ (마이크는 http(s) 또는 파일에서 허용 필요)
- `index.html` 더블클릭(file://)도 동작 (음성·폰트는 js/css에 내장).
- 테스트 훅: `window.__test = { mic:false | heard:true, target:'moon', teeth:[...] }`, `window.__croco`.

## 구성
- `js/croc.js` — 3D 악어(three.js). SDF로 만든 클레이 질감 모델: 윗턱(경첩) 덥석, 이빨 눌림, 눈 깜빡/찡그림/시선.
- `js/sdf.js` — SDF + Surface Nets 메셔. `js/stage.js` — 카메라·조명·그림자·피킹.
- `js/game.js` — 진행(지시 단어 → 턴 → 공개/말하기/수집 → 덥석/결과). `js/audio.js` — 음성·효과음·배경음·마이크.
- `js/fx.js` — 반짝이·별·색종이·보라 폭발.
- 에셋: `assets/img/logo.webp`(사용자 인트로 이미지에서 로고만 오려냄 · `tools/cut_logo.py`), `p1/p2.webp`(게임 화면 레퍼런스의 아바타 · `tools/crop_avatars.py`), `assets/cards/`, `assets/voice/`.
- 레퍼런스(사용자 Gemini 이미지)는 `design/*.png` — 용량 때문에 git 제외.

## 음성
회사 TTS 소년 목소리(Qwen3 'aiden') = Magic Block과 같은 목소리. 단어 12개, 공식 FPR K /m/ 음원, 공용 대사는 Magic Block에서 재사용.
게임 전용 새 대사(인사·규칙 "Watch out for this word!"·덥석 등)는 **회사망에서** 아래로 생성:
```
zsh -ic '/Users/jini/.hermes/bin/uv run --with numpy python tools/build_voice.py'
```
(새 대사가 없으면 게임은 그 대사만 건너뛰고 진행)

## 레퍼런스
- 화면: 사용자 제공 인트로/게임 화면 이미지, 인터랙션: `~/Downloads/gemini_generated_video_46830cdd.mp4`
  (이빨에서 카드 팝 → 누른 쪽 옆에 떠 있다 → 코너로 도킹, 위험 이빨 보라색 + 지시 카드 빨간 경고 → 폭발 + "Player N Wins!" + 색종이)
