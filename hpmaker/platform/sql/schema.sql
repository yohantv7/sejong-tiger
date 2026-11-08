-- hpmaker 플랫폼 (sjtiger.kr/hpmaker/platform) 데이터베이스 구조
-- 가비아 MySQL 에서 실행합니다. 쇼핑몰과 같은 DB 를 써도 겹치지 않도록 모든 테이블 이름 앞에 pf_ 를 붙였습니다.
-- install.php 가 이 파일을 읽어 자동으로 실행하므로, 직접 실행하지 않아도 됩니다.

-- 회원: 로그인은 Firebase(세종호랑이 계정), 플랫폼 활동 정보는 여기에 저장
CREATE TABLE IF NOT EXISTS pf_users (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    firebase_uid  VARCHAR(128) NOT NULL,
    email         VARCHAR(190) NOT NULL DEFAULT '',
    nickname      VARCHAR(30)  NOT NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_uid (firebase_uid),
    UNIQUE KEY uq_nickname (nickname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 판매 상품
CREATE TABLE IF NOT EXISTS pf_listings (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    seller_id    INT UNSIGNED NOT NULL,
    title        VARCHAR(100) NOT NULL,
    description  TEXT         NOT NULL,
    category     VARCHAR(20)  NOT NULL,
    price        INT UNSIGNED NOT NULL,
    stock        INT UNSIGNED NOT NULL DEFAULT 1,
    image        VARCHAR(255) NOT NULL DEFAULT '',
    status       ENUM('on','sold','hidden') NOT NULL DEFAULT 'on',
    sold_count   INT UNSIGNED NOT NULL DEFAULT 0,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    -- 목록 화면의 정렬·필터가 표 전체를 훑지 않고 인덱스만 따라가도록 만든 색인들
    KEY ix_status_id        (status, id),
    KEY ix_status_cat_id    (status, category, id),
    KEY ix_status_price_id  (status, price, id),
    KEY ix_status_sold_id   (status, sold_count, id),
    KEY ix_seller_id        (seller_id, id),
    CONSTRAINT fk_listing_seller FOREIGN KEY (seller_id) REFERENCES pf_users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 주문 (구매 신청 → 발송 → 거래 완료 / 취소)
CREATE TABLE IF NOT EXISTS pf_orders (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    listing_id   INT UNSIGNED NOT NULL,
    buyer_id     INT UNSIGNED NOT NULL,
    seller_id    INT UNSIGNED NOT NULL,
    title        VARCHAR(100) NOT NULL,           -- 주문 당시 상품명 (나중에 상품이 바뀌어도 기록 유지)
    qty          INT UNSIGNED NOT NULL,
    unit_price   INT UNSIGNED NOT NULL,
    total        INT UNSIGNED NOT NULL,
    buyer_note   VARCHAR(300) NOT NULL DEFAULT '', -- 연락처·받는 곳 등 판매자에게 전할 메모
    status       ENUM('requested','shipped','completed','cancelled') NOT NULL DEFAULT 'requested',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_buyer_id   (buyer_id, id),
    KEY ix_seller_id  (seller_id, id),
    KEY ix_listing_id (listing_id),
    CONSTRAINT fk_order_listing FOREIGN KEY (listing_id) REFERENCES pf_listings (id),
    CONSTRAINT fk_order_buyer   FOREIGN KEY (buyer_id)   REFERENCES pf_users (id),
    CONSTRAINT fk_order_seller  FOREIGN KEY (seller_id)  REFERENCES pf_users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
