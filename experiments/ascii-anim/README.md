# Crawl 에셋 · 데이터 · ASCII 애니메이션 활용 가능성 검증

이 디렉터리는 "던전 크롤의 에셋/데이터/ASCII 애니메이션 코드로 뭘 할 수 있는가"를
**실제로 돌려보면서** 검증한 결과다. 게임 바이너리를 빌드하지 않고, 저장소의
데이터 파일만 읽어 애니메이션을 재생한다.

```
python3 test_anim.py                # 38개 검증 항목 전부 실행
python3 demo.py --list              # 로딩된 데이터 통계
python3 demo.py explosion           # 터미널에서 애니메이션 재생
python3 demo.py --all --dump out/   # 전 애니메이션 프레임을 텍스트로 덤프
```

요구사항: Python 3.9+, PyYAML.

---

## 1. 검증 결과 요약

| 항목 | 결과 |
|---|---|
| 몬스터 데이터 (`dat/mons/*.yaml`) | **683종** 파싱 성공, 글리프·색상·스탯 전부 구조화됨 |
| 뱅크 맵 (`dat/des/**/*.des`) | **6,057개** ASCII 맵 추출 성공 (최대 5,600셀) |
| ASCII 글리프 표 (`viewchar.cc`) | CSET_ASCII **73자** 소스에서 직접 파싱 성공 |
| 애니메이션 이식 | **7종** 전부 재현, 프레임 생성·형상 보존 확인 |
| 타일 PNG | 개별 파일 **8,691개** (아틀라스가 아닌 원본 스프라이트) |

`test_anim.py` 38개 항목 전부 PASS.

---

## 2. ASCII 애니메이션 — 구조 분석

### 2.1 핵심 발견: 애니메이션 계층이 게임 로직과 거의 분리돼 있다

Crawl의 ASCII 애니메이션은 전부 **딱 세 가지 원시 연산**으로 환원된다.

1. `view_add_glyph_overlay(gc, {glyph, colour})` — `view.cc:748`
   좌표 하나에 (문자, 색) 오버레이를 push. 베이스 맵은 건드리지 않는다.
2. `animation_delay(ms, do_refresh)` — `view.cc:213`
   화면 재그리기 + `scaled_delay()`. 딜레이는 `Options.view_delay` 비율로 스케일.
3. `view_clear_overlays()` — `view.cc:779`
   오버레이 벡터 비우기.

즉 **오버레이 리스트 + 딜레이 루프**가 전부다. 게임 상태(몬스터, HP, 시야)는
"어디에 그릴지"를 정할 때만 쓰이고, 그리는 행위 자체와는 무관하다.
이 때문에 그리드와 글리프만 있으면 게임 밖으로 그대로 뽑아낼 수 있다 —
`anim.py`가 그 증명이다.

### 2.2 이식한 7종

| 클래스 (`anim.py`) | 원본 | 알고리즘 |
|---|---|---|
| `Bolt` | `beam.cc:721 bolt::draw` | 광선 경로를 따라 글리프 1개씩. **잔상을 지우지 않는다** (의도적 — `view.cc:726` 주석) |
| `Explosion` | `beam.cc:6985 bolt::explode` | `_radial_sweep(r)`로 체비쇼프 반경별 링을 만들어 안→밖 한 프레임씩. 마지막에 `delay*3` |
| `Ring` | `view.cc:787 draw_ring_animation` | 반경 링 단위 `flash_tile`. `outward` 플래그로 수축/확장, `colour_alt`로 2색 랜덤 혼합 |
| `ShakeViewport` | `view.cc:448` | 뷰포트 전체를 매 프레임 (-1..1, -1..1) 오프셋. 5프레임 × 40ms |
| `BanishDissolve` | `view.cc:469` | 셀마다 `random2(10 - frame) == 0`이면 영구히 사라짐. 남은 셀이 있는 한 `frames`를 계속 늘려 전부 녹을 때까지 재생 |
| `OrbPulse` | `view.cc:519` | 타원 거리 `dx²·4/9 + dy²`로 링을 잡고 색만 바꿈. 프레임 딜레이가 `3·(6-r)²`로 가변 — 바깥에서 느려진다 |
| `FlashView` | `view.cc:249 flash_view_delay` | 전 화면 단색 오버레이 1비트 |

### 2.3 눈여겨볼 설계 디테일

- **타원 보정**: `OrbPulse`의 `dx*dx*4/9`는 터미널 셀이 세로로 약 2배 길다는 걸
  보정한다. ASCII에서 "원"을 그리려면 필수인데 대부분 잊는 부분이다.
- **가변 프레임 딜레이**: `orb_animation::init_frame`이 매 프레임 `frame_delay`를
  다시 계산한다. 이징(easing)을 별도 시스템 없이 구현한 방식.
- **자기 종료 애니메이션**: `banish_animation`은 `frames`를 `frame + 2`로 계속
  늘리다가 남은 셀이 없으면 `frames = frame`으로 줄여 스스로 멈춘다.
  프레임 수를 미리 모르는 애니메이션의 깔끔한 패턴.
- **`Options.reduce_animations`**: 중간 프레임을 건너뛰고 최종 상태만 그리는
  전역 스위치. 접근성·성능 옵션을 애니메이션 계층에 박아둔 좋은 사례.
- **타일/ASCII 이중 경로**: `flash_tile()` 하나가 `#ifdef USE_TILE`로 갈라져
  타일이면 `view_add_tile_overlay`, 아니면 `view_add_glyph_overlay`를 부른다.
  **호출부는 동일**하다. 렌더러 교체가 쉽다는 뜻.
- **호출 규모**: `flash_tile` / `draw_ring_animation` / `view_add_glyph_overlay`
  호출이 트리 전체에 96곳, 20개 파일에 퍼져 있다. 주술·능력·신 효과마다
  이 원시 연산을 조합해 쓴다.

### 2.4 애니메이션 카테고리 (`options.h:226`)

`use_animation_type` 비트플래그로 9종을 개별 on/off 한다:
`UA_BEAM`(투사체) · `UA_RANGE` · `UA_HP` · `UA_MONSTER_IN_SIGHT` ·
`UA_PICKUP` · `UA_MONSTER` · `UA_PLAYER` · `UA_BRANCH_ENTRY` · `UA_ALWAYS_ON`.

---

## 3. 데이터 — 무엇을 꺼내 쓸 수 있나

### 3.1 즉시 재사용 가능 (구조화돼 있음)

- **`dat/mons/*.yaml` — 683종 몬스터.** 최근 YAML로 이관돼서 파싱이 자명하다.
  `glyph: {char: "S", colour: lightgreen}` + HD/HP/AC/EV/공격/속도/서식지/크기.
  글리프 분포는 `@`26종, `D`(드래곤)15, `p`15, `J`13, `S`13 … 로 로그라이크의
  관례적 분류 체계가 그대로 데이터에 있다.
- **`dat/des/**/*.des` — 6,057개 손으로 그린 ASCII 맵.** `MAP`/`ENDMAP` 블록으로
  바로 추출된다. 각 맵에 `TAGS`/`ORIENT`/`WEIGHT`/`SUBST`/`SHUFFLE` 메타데이터와
  Lua 훅이 붙어 있다. 절차적 생성 학습 데이터·레벨 에디터 소재로 그대로 쓸 수 있다.
- **`defines.h:202` 16색 팔레트** — CGA/DOS 순서. ANSI로는 blue/red만 스왑하면 된다.
- **`viewchar.cc` dchar 표** — `CSET_DEFAULT`(CP437+WGL4 유니코드)와 `CSET_ASCII`
  두 벌. 유니코드판은 `▓ ∩ ⌠ ≈ ♦ ♣ ═ ║ ╔` 등을 쓴다. 같은 의미의 두 문자셋 매핑을
  공짜로 얻는 셈.

### 3.2 텍스트 자산

- `dat/descript/` — 몬스터 735 / 아이템 312 / 주문 408개 설명문, **20개 언어** 번역 포함
  (ko 포함). 병렬 코퍼스로도 쓸 수 있다.
- `dat/database/` — 절차적 생성기 소스. `monspeak.txt` 742엔트리(몬스터 대사),
  `monspell.txt` 284, `godspeak.txt` 195, `decorlines.txt` 133, `graffiti.txt` 58,
  `randname.txt`/`rand_wpn.txt`/`randbook.txt`(랜덤 아티팩트·책 이름 문법) 등.
  자체 템플릿 문법(`%%%%` 구분, 가중치, 재귀 치환)을 쓴다.

### 3.3 코드 내 데이터 테이블

`feature-data.h`(783줄, 지형 → 글리프/색/플래그), `spl-data.h`(주문 → 스쿨/레벨/파워/타일),
`zap-data.h`(발사체 → 색·글리프·데미지 함수·폭발 여부), `dungeon-char-type.h`(73종 dchar).
전부 매크로 없는 평범한 C 이니셜라이저라 정규식으로 파싱된다.
실제로 `crawl_data.dchar_table_from_source()`가 `viewchar.cc`를 파싱해 73자를 뽑는다.

### 3.4 타일 에셋

개별 PNG **8,691개**: `dngn` 2300, `mon` 1590, `player` 1182, `item` 1123,
`gui` 1019, `effect` 490, `misc` 347, `UNUSED` 591(미사용 스프라이트 보관고).
`rltiles/dc-*.txt`가 "파일경로 → 열거형 상수" 매핑 + `%sdir`/`%rim` 디렉티브로
아틀라스 빌드를 기술한다. 애니메이션 프레임은 같은 이름 뒤에 `01`,`02`… 를 붙여
표현한다 (예: `lernaean_hydra01..07`).

---

## 4. 라이선스 — 실제 제약

**이게 가장 중요한 실무 제약이다.**

- 게임 코드: **GPL v2+** (`LICENSE`). 코드를 가져다 쓰면 파생물도 GPL.
  `anim.py`는 알고리즘을 재구현한 것이지만, 원본을 직접 보고 옮겼으므로
  보수적으로 GPL로 취급하는 게 맞다.
- 타일 대부분: **Public Domain / CC0** (RLTiles 유래, `rltiles/license.txt`).
  → **에셋은 상용 포함 자유롭게 쓸 수 있다.** 단 "대부분"이므로 개별 확인 필요.
- `docs/license/`에 CC0/LGPL/libpng/Lua/PCRE/Worley 라이선스가 따로 들어 있다.
- 타이틀 아트(`dat/tiles/title_*.png`)는 개별 아티스트 작품 — 별도 확인 필요.

**정리**: 데이터·타일은 넓게 활용 가능, 코드는 GPL 전염성에 주의.

---

## 5. 그래서 뭘 할 수 있나 (검증된 것 기준)

**바로 되는 것** — 이 디렉터리에서 실제로 동작을 확인한 범위:

1. **게임 밖 ASCII 이펙트 라이브러리.** 오버레이+딜레이 모델은 그리드 하나만
   있으면 성립한다. 터미널 앱, 웹 터미널(xterm.js), TUI 게임에 그대로 이식된다.
2. **6,057개 ASCII 맵 코퍼스.** 레벨 생성 모델 학습, 맵 에디터 프리셋,
   던전 생성 알고리즘 벤치마크.
3. **683종 몬스터 밸런스 데이터셋.** HD/HP/AC/EV/공격이 구조화돼 있어
   난이도 곡선 분석·밸런싱 실험에 바로 쓸 수 있다.
4. **20개 언어 병렬 설명문 코퍼스.**
5. **글리프↔타일 대응표.** 같은 개체의 ASCII 표현과 스프라이트가 1:1로 연결돼 있어
   ASCII→타일 자동 변환기를 만들 수 있다.

**추가 작업이 필요한 것:**

6. **웹 렌더러.** `webserver/game_data/static/`에 이미 JS 렌더러
   (`cell_renderer.js`, `dungeon_renderer.js`, `view_data.js`)가 있다.
   ASCII 경로만 떼어내면 브라우저 재생기가 된다.
7. **Lua 확장.** `l-view.cc`가 뷰 질의 API(`feature_at`, `cloud_at`,
   `is_safe_square`)를 노출하지만 **그리기 API는 없다.** ASCII 애니메이션을
   Lua로 작성하려면 `view_add_glyph_overlay`/`animation_delay` 바인딩을
   새로 추가해야 한다 — 소규모 작업이고, 애니메이션 계층이 이미 분리돼 있어
   난도는 낮다.
8. **애니메이션 회귀 테스트.** `screenshot()` (`view.cc` → `chardump.cc:784`)이
   뷰를 텍스트로 덤프한다. 프레임 단위 스냅샷 테스트를 붙일 수 있는 지점.

---

## 6. 파일

| 파일 | 내용 |
|---|---|
| `crawl_data.py` | 몬스터 YAML / `.des` 맵 / dchar 표 / 16색 팔레트 로더 |
| `anim.py` | 애니메이션 7종 이식 (각 클래스 docstring에 원본 파일:줄 표기) |
| `demo.py` | 실제 볼트 맵 위에서 재생 / 프레임 덤프 CLI |
| `test_anim.py` | 38개 검증 항목 |
| `GAMES.md` | 외부 ASCII 게임 조사 — 장르별로 무엇이 증명됐고 다음 견본에 어떤 비용이 드는지 |
| `web/` | 브라우저 견본들. `web/horde.html`이 본 프로젝트, `web/BACKLOG.md`·`web/BENCH.md`가 그 문서 |

각 이식 클래스는 원본 위치를 주석으로 달아뒀으므로, 상류 코드가 바뀌면
대조해서 갱신하면 된다.
