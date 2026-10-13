import { defineConfig } from 'vite';

// GitHub Pages (Project Site: https://<username>.github.io/<repo-name>/)
// 서브디렉토리 배포 시 에셋 404를 방지하기 위해 상대 경로 base 설정
export default defineConfig({
  base: './',
});
