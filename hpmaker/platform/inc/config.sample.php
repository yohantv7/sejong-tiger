<?php
// 이 파일을 복사해 이름을 config.php 로 바꾸고, 아래 값을 채운 뒤 가비아 서버의
// hpmaker/platform/inc 폴더에 올리세요. config.php 는 GitHub 에 올리지 않습니다 (.gitignore 에 등록됨).
return [
    // 가비아 MySQL 접속 정보 (가비아 My가비아 → 웹호스팅 → 서비스 관리 → DB 정보에서 확인)
    // 쇼핑몰(hpmaker/shop)과 같은 DB 를 써도 됩니다. 플랫폼 테이블은 모두 pf_ 로 시작합니다.
    'DB_HOST' => 'localhost',
    'DB_NAME' => '여기에_DB_이름',
    'DB_USER' => '여기에_DB_아이디',
    'DB_PASS' => '여기에_DB_비밀번호',

    // 세종호랑이 Firebase 프로젝트 ID (로그인 토큰 확인용, 바꿀 필요 없음)
    'FIREBASE_PROJECT_ID' => 'my-home-74cf5',

    // install.php 를 실행할 때 주소 뒤에 붙이는 비밀 문구. 아무 영문·숫자 조합으로 바꾸세요.
    // 예) https://sjtiger.kr/hpmaker/platform/install.php?key=여기에_적은_값
    'INSTALL_KEY' => '여기에_설치용_비밀문구',
];
