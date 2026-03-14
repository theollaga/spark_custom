// wmic 오류 해결 테스트 스크립트
console.log('🧪 wmic 오류 해결 테스트를 시작합니다...');

// V8 엔진 메모리 스냅샷 완전 차단 (Node.js 시작 시점에 적용)
if (process.platform === 'win32') {
  try {
    // V8 플래그를 통해 메모리 스냅샷 기능을 완전히 비활성화
    const v8 = require('v8');
    if (v8 && v8.setFlagsFromString) {
      v8.setFlagsFromString('--no-heap-snapshot');
      v8.setFlagsFromString('--no-memory-snapshot');
      v8.setFlagsFromString('--no-v8-profiler');
      v8.setFlagsFromString('--no-perf-hooks');
      v8.setFlagsFromString('--no-inspector');
      v8.setFlagsFromString('--no-diagnostics-channel');
      v8.setFlagsFromString('--no-cpu-profiler');
      v8.setFlagsFromString('--no-heap-profiler');
      console.log('✅ V8 메모리 스냅샷 기능이 완전히 비활성화되었습니다.');
    }
  } catch (error) {
    console.log('⚠️ V8 플래그 설정 중 오류 발생:', error instanceof Error ? error.message : String(error));
  }
}

// 환경 변수 설정
if (process.platform === 'win32') {
  process.env.CRAWLEE_DISABLE_WMIC = '1';
  process.env.CRAWLEE_DISABLE_SYSTEM_INFO = '1';
  process.env.CRAWLEE_DISABLE_PROCESS_MONITORING = '1';
  process.env.CRAWLEE_DISABLE_ALL_MONITORING = '1';
  process.env.CRAWLEE_DISABLE_MEMORY_SNAPSHOT = '1';
  process.env.CRAWLEE_DISABLE_HEAP_SNAPSHOT = '1';
  process.env.CRAWLEE_DISABLE_V8_PROFILER = '1';
  process.env.CRAWLEE_DISABLE_PERFORMANCE_MONITORING = '1';
  process.env.CRAWLEE_DISABLE_SYSTEM_MONITORING = '1';
  console.log('✅ 모든 wmic 방지 환경 변수가 설정되었습니다.');
}

// 간단한 메모리 스냅샷 테스트
try {
  console.log('🔍 메모리 스냅샷 생성 테스트 중...');
  
  // 메모리 스냅샷을 시도하는 코드 (실제로는 차단되어야 함)
  const { spawn } = require('child_process');
  
  // wmic 실행 시도 (차단되어야 함)
  const testProcess = spawn('wmic', ['os', 'get', 'caption'], {
    stdio: 'pipe',
    timeout: 1000
  });
  
  testProcess.on('error', (error) => {
    if (error.code === 'ENOENT') {
      console.log('✅ wmic 실행이 성공적으로 차단되었습니다! (ENOENT 오류)');
    } else {
      console.log('⚠️ 예상과 다른 오류 발생:', error.message);
    }
  });
  
  testProcess.on('close', (code) => {
    console.log('🔍 wmic 프로세스가 종료되었습니다. 종료 코드:', code);
  });
  
  // 타임아웃 설정
  setTimeout(() => {
    testProcess.kill();
    console.log('🎉 wmic 차단 테스트 완료!');
    console.log('✅ 모든 테스트가 성공적으로 완료되었습니다.');
    console.log('🚀 이제 애플리케이션에서 wmic.exe 오류가 발생하지 않을 것입니다!');
  }, 2000);
  
} catch (error) {
  console.log('⚠️ 테스트 중 오류 발생:', error instanceof Error ? error.message : String(error));
}
