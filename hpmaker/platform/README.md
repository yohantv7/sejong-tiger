# hpmaker 플랫폼 (sjtiger.kr/hpmaker/platform)

여러 회원이 판매자이자 구매자가 되어 사고 파는 장터입니다. LAMP(Linux·Apache·MySQL·PHP) 구성으로, 가비아 웹호스팅에 그대로 올려 씁니다.

## 구성

| 파일 | 역할 |
|---|---|
| `index.html`, `assets/app.js`, `assets/app.css` | 화면 (HTML·CSS·JavaScript, 프레임워크 없이 가볍게) |
| `api.php` | 서버 (PHP) — 목록·상세·등록·구매·주문 처리 |
| `inc/lib.php` | DB 연결, Firebase 로그인 확인, 캐시 |
| `inc/config.sample.php` | 설정 견본 → `config.php` 로 복사해 DB 정보 입력 |
| `sql/schema.sql` | MySQL 테이블 구조 (`pf_users`, `pf_listings`, `pf_orders`) |
| `install.php` | 처음 한 번 테이블을 만들어 주는 설치 파일 |
| `.htaccess` | 압축·캐시 설정, 설정 파일 차단 |
| `cache/`, `uploads/` | 빠른 응답용 캐시, 상품 사진 (서버가 쓰기 가능해야 함) |

로그인은 세종호랑이와 같은 Firebase 계정을 씁니다. 같은 주소(sjtiger.kr)라서 메인에서 로그인하면 플랫폼에서도 로그인된 상태입니다.

## 가비아에 올리는 순서

1. FileZilla로 sjtiger.kr의 `index.html`이 있는 폴더를 엽니다. 그 안의 `hpmaker` 폴더에 이 `platform` 폴더를 통째로 올립니다.
2. `platform/inc/config.sample.php`를 복사해 이름을 `config.php`로 바꿉니다. 그다음 가비아 MySQL 접속 정보(쇼핑몰과 같은 DB를 써도 됨)와 `INSTALL_KEY`(아무 영문·숫자)를 적어 서버의 `platform/inc/`에 올립니다.
3. 브라우저에서 `https://sjtiger.kr/hpmaker/platform/install.php?key=적은INSTALL_KEY`를 엽니다.
   - "테이블 준비 완료"가 나오면 성공입니다.
   - "폴더 쓰기: 불가"가 나오면 FileZilla에서 `cache`, `uploads` 폴더의 권한을 755(안 되면 707)로 바꾸세요.
4. 설치가 끝나면 서버의 `install.php`는 지워도 됩니다.
5. 메인 메뉴를 바꾼 sjtiger.kr의 `index.html`도 다시 올립니다.

## 빠르게 동작하도록 한 부분

- **목록 쿼리:** 정렬마다 맞춘 색인을 두고, 쪽 번호 대신 "마지막으로 본 위치(커서)" 다음부터 읽습니다. 상품이 수만 개가 되어도 같은 속도로 응답합니다.
- **파일 캐시:** 여러 사람이 같은 목록·상세를 보면 5초 동안 파일 캐시로 응답합니다. 상품이나 주문이 바뀌면 캐시를 즉시 새로 만듭니다.
- **304 응답과 압축:** 내용이 같으면 ETag로 본문 없이 304를 보내고, 결과는 gzip으로 압축합니다.
- **화면 쪽 처리:** 카드에 마우스를 올리거나 손을 대면 상세를 미리 받아 둡니다. 사진은 올리기 전에 브라우저에서 줄이고, 서버에서도 긴 변 1200px로 다시 저장합니다.
- **동시 구매:** 재고 감소를 조건부 UPDATE 한 문장으로 처리합니다. 마지막 1개에 여러 명이 동시에 눌러도 한 명만 성공합니다.

## 거래 흐름

구매 신청 → (판매자) 발송 완료 → (구매자) 수령 확인 = 거래 완료.
구매 신청 단계에서는 양쪽 모두 취소할 수 있고, 취소하면 재고가 돌아옵니다.
대금 결제(PG)는 연결되어 있지 않아 판매자와 구매자가 직접 주고받습니다.
