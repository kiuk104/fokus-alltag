[33mcommit 584c7682c871896ec0d81a50083c576167761b55[m[33m ([m[1;36mHEAD[m[33m -> [m[1;32mmain[m[33m, [m[1;31morigin/main[m[33m)[m
Author: 기욱 <kiuk104@gmail.com>
Date:   Wed Sep 30 10:11:58 2026 +0200

    듣기: 유튜브 자막 문장 구간 API (listen-captions)

 api/listen-captions.js       | 79 [32m++++++++++++++++++++++++++++++++++[m[31m----------[m
 api/listen-captions.test.mjs | 28 [32m+++++++++++++++[m[31m-[m
 2 files changed, 88 insertions(+), 19 deletions(-)

[33mcommit 10e5afbaf2ed2514f82a2b8fe8fab3e62fc96172[m
Author: 기욱 <kiuk104@gmail.com>
Date:   Wed Sep 30 09:48:24 2026 +0200

    듣기: 유튜브 자막 문장 구간 API

 api/_captions-parse.js       | 193 [32m+++++++++++++++++++++++++++++++++++++++++++[m
 api/listen-captions.js       | 107 [32m++++++++++++++++++++++++[m
 api/listen-captions.test.mjs | 162 [32m++++++++++++++++++++++++++++++++++++[m
 3 files changed, 462 insertions(+)

[33mcommit 2469c0874bbcedc30084e929c122ecf2698a0524[m
Author: 기욱 <kiuk104@gmail.com>
Date:   Wed Sep 30 09:12:17 2026 +0200

    아이콘: 테라코타 + 해 (다른 Fokus 앱과 구분)

 public/icons/apple-touch-icon.png  | Bin [31m1918[m -> [32m8668[m bytes
 public/icons/favicon-32.png        | Bin [31m713[m -> [32m6591[m bytes
 public/icons/favicon.svg           |   2 [32m+[m[31m-[m
 public/icons/icon-192.png          | Bin [31m3426[m -> [32m10293[m bytes
 public/icons/icon-512.png          | Bin [31m9491[m -> [32m17966[m bytes
 public/icons/icon-maskable-512.png | Bin [31m4176[m -> [32m12614[m bytes
 vite.config.js                     |   2 [32m+[m[31m-[m
 7 files changed, 2 insertions(+), 2 deletions(-)
