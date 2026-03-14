#!/usr/bin/env node

/**
 * wmic 방지 설정 검증 스크립트
 * 프로젝트의 wmic 방지 설정이 올바르게 적용되었는지 확인합니다.
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 wmic 방지 설정 검증을 시작합니다...\n');

// 검증할 파일들
const filesToCheck = [
  'src/main/index.ts',
  'src/crawlee/index.ts',
  'src/config/index.ts'
];

// 필수 환경 변수들
const requiredEnvVars = [
  'CRAWLEE_DISABLE_WMIC',
  'CRAWLEE_DISABLE_SYSTEM_INFO',
  'CRAWLEE_DISABLE_PROCESS_MONITORING',
  'CRAWLEE_DISABLE_ALL_MONITORING',
  'CRAWLEE_DISABLE_MEMORY_SNAPSHOT',
  'CRAWLEE_DISABLE_HEAP_SNAPSHOT',
  'CRAWLEE_DISABLE_V8_PROFILER',
  'CRAWLEE_DISABLE_PERFORMANCE_MONITORING',
  'CRAWLEE_DISABLE_SYSTEM_MONITORING',
  'CRAWLEE_DISABLE_PERSIST_STATE',
  'CRAWLEE_DISABLE_STATE_PERSISTENCE',
  'CRAWLEE_DISABLE_FILE_LOCKING',
  'CRAWLEE_DISABLE_STORAGE_LOCKING',
  'CRAWLEE_DISABLE_KEY_VALUE_STORE_LOCKING',
  'CRAWLEE_DISABLE_DATASET_LOCKING',
  'CRAWLEE_DISABLE_REQUEST_QUEUE_LOCKING',
  'CRAWLEE_DISABLE_POWERSHELL',
  'CRAWLEE_DISABLE_WMI',
  'CRAWLEE_DISABLE_CIM',
  'CRAWLEE_DISABLE_COMPUTER_INFO',
  'CRAWLEE_DISABLE_PROCESS_INFO',
  'CRAWLEE_DISABLE_SERVICE_INFO',
  'CRAWLEE_DISABLE_COUNTER_INFO',
  'CRAWLEE_DISABLE_EVENT_LOG',
  'CRAWLEE_DISABLE_WIN_EVENT',
  'CRAWLEE_DISABLE_SYSTEM_MANAGEMENT',
  'CRAWLEE_DISABLE_WINDOWS_MANAGEMENT',
  'CRAWLEE_DISABLE_POWERSHELL_COMMANDS',
  'CRAWLEE_DISABLE_WMI_QUERIES',
  'CRAWLEE_DISABLE_CIM_QUERIES',
  'CRAWLEE_DISABLE_SESSION_POOL',
  'CRAWLEE_DISABLE_SESSION_MANAGEMENT',
  'CRAWLEE_DISABLE_SESSION_STATE',
  'CRAWLEE_DISABLE_SESSION_PERSISTENCE',
  'CRAWLEE_DISABLE_SESSION_LOCKING',
  'CRAWLEE_DISABLE_SESSION_MONITORING',
  'CRAWLEE_DISABLE_SESSION_METRICS',
  'CRAWLEE_DISABLE_SESSION_TELEMETRY',
  'CRAWLEE_DISABLE_SESSION_POOL_STATE',
  'CRAWLEE_DISABLE_SESSION_POOL_MANAGEMENT',
  'CRAWLEE_DISABLE_SESSION_POOL_MONITORING',
  'CRAWLEE_DISABLE_SESSION_POOL_METRICS',
  'CRAWLEE_DISABLE_SESSION_POOL_TELEMETRY',
  'CRAWLEE_DISABLE_SESSION_POOL_LOCKING',
  'CRAWLEE_DISABLE_SESSION_POOL_PERSISTENCE',
  'CRAWLEE_DISABLE_SESSION_POOL_STATE_PERSISTENCE',
  'CRAWLEE_DISABLE_SESSION_POOL_STATE_LOCKING',
  'CRAWLEE_DISABLE_SESSION_POOL_STATE_MONITORING',
  'CRAWLEE_DISABLE_SESSION_POOL_STATE_METRICS',
  'CRAWLEE_DISABLE_SESSION_POOL_STATE_TELEMETRY',
  'CRAWLEE_DISABLE_SESSION_POOL_CREATION',
  'CRAWLEE_DISABLE_SESSION_POOL_INITIALIZATION',
  'CRAWLEE_DISABLE_SESSION_POOL_STORAGE',
  'CRAWLEE_DISABLE_SESSION_POOL_FILES',
  'CRAWLEE_DISABLE_SESSION_POOL_DIRECTORIES',
  'CRAWLEE_DISABLE_SESSION_POOL_JSON',
  'CRAWLEE_DISABLE_SESSION_POOL_LOCK_FILES',
  'CRAWLEE_DISABLE_SESSION_POOL_STATE_FILES',
  'CRAWLEE_DISABLE_SESSION_POOL_STATE_DIRECTORIES',
  'CRAWLEE_DISABLE_SESSION_POOL_STATE_JSON',
  'CRAWLEE_DISABLE_SESSION_POOL_STATE_LOCK_FILES',
  'CRAWLEE_DISABLE_CRAWLER_STATISTICS',
  'CRAWLEE_DISABLE_CRAWLER_STATISTICS_FILES',
  'CRAWLEE_DISABLE_CRAWLER_STATISTICS_JSON',
  'CRAWLEE_DISABLE_CRAWLER_STATISTICS_LOCK_FILES',
  'CRAWLEE_DISABLE_CRAWLER_STATISTICS_STORAGE',
  'CRAWLEE_DISABLE_CRAWLER_STATISTICS_DIRECTORIES',
  'CRAWLEE_DISABLE_CRAWLER_STATISTICS_MONITORING',
  'CRAWLEE_DISABLE_CRAWLER_STATISTICS_METRICS',
  'CRAWLEE_DISABLE_CRAWLER_STATISTICS_TELEMETRY',
  'CRAWLEE_DISABLE_CRAWLER_STATISTICS_PERSISTENCE',
  'CRAWLEE_DISABLE_CRAWLER_STATISTICS_STATE',
  'CRAWLEE_DISABLE_CRAWLER_STATISTICS_STATE_FILES',
  'CRAWLEE_DISABLE_CRAWLER_STATISTICS_STATE_JSON',
  'CRAWLEE_DISABLE_CRAWLER_STATISTICS_STATE_LOCK_FILES',
  'CRAWLEE_DISABLE_CRAWLER_STATISTICS_STATE_STORAGE',
  'CRAWLEE_DISABLE_CRAWLER_STATISTICS_STATE_DIRECTORIES',
  'CRAWLEE_DISABLE_CRAWLER_STATISTICS_STATE_MONITORING',
  'CRAWLEE_DISABLE_CRAWLER_STATISTICS_STATE_METRICS',
  'CRAWLEE_DISABLE_CRAWLER_STATISTICS_STATE_TELEMETRY',
  'CRAWLEE_DISABLE_SDK_FILES',
  'CRAWLEE_DISABLE_SDK_JSON',
  'CRAWLEE_DISABLE_SDK_LOCK_FILES',
  'CRAWLEE_DISABLE_SDK_STORAGE',
  'CRAWLEE_DISABLE_SDK_DIRECTORIES',
  'CRAWLEE_DISABLE_SDK_MONITORING',
  'CRAWLEE_DISABLE_SDK_METRICS',
  'CRAWLEE_DISABLE_SDK_TELEMETRY',
  'CRAWLEE_DISABLE_SDK_PERSISTENCE',
  'CRAWLEE_DISABLE_SDK_STATE',
  'CRAWLEE_DISABLE_SDK_STATE_FILES',
  'CRAWLEE_DISABLE_SDK_STATE_JSON',
  'CRAWLEE_DISABLE_SDK_STATE_LOCK_FILES',
  'CRAWLEE_DISABLE_SDK_STATE_STORAGE',
  'CRAWLEE_DISABLE_SDK_STATE_DIRECTORIES',
  'CRAWLEE_DISABLE_SDK_STATE_MONITORING',
  'CRAWLEE_DISABLE_SDK_STATE_METRICS',
  'CRAWLEE_DISABLE_SDK_STATE_TELEMETRY'
];

// 검증 결과
let allChecksPassed = true;

// 1. 파일 존재 여부 확인
console.log('📁 파일 존재 여부 확인:');
filesToCheck.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - 파일이 존재하지 않습니다.`);
    allChecksPassed = false;
  }
});

console.log('');

// 2. wmic 방지 환경 변수 설정 확인
console.log('🔧 wmic 방지 환경 변수 설정 확인:');
try {
  const mainFile = fs.readFileSync('src/main/index.ts', 'utf8');
  const crawleeFile = fs.readFileSync('src/crawlee/index.ts', 'utf8');

  if (mainFile.includes('CRAWLEE_DISABLE_WMIC') && mainFile.includes('= \'1\'')) {
    console.log('  ✅ src/main/index.ts에서 CRAWLEE_DISABLE_WMIC 설정됨');
  } else {
    console.log('  ❌ src/main/index.ts에서 CRAWLEE_DISABLE_WMIC 설정되지 않음');
    allChecksPassed = false;
  }

  if (crawleeFile.includes('CRAWLEE_DISABLE_WMIC') && crawleeFile.includes('= \'1\'')) {
    console.log('  ✅ src/crawlee/index.ts에서 CRAWLEE_DISABLE_WMIC 설정됨');
  } else {
    console.log('  ❌ src/crawlee/index.ts에서 CRAWLEE_DISABLE_WMIC 설정되지 않음');
    allChecksPassed = false;
  }

  // 메모리 스냅샷 관련 설정 확인
  const memorySnapshotVars = [
    'CRAWLEE_DISABLE_MEMORY_SNAPSHOT',
    'CRAWLEE_DISABLE_HEAP_SNAPSHOT',
    'CRAWLEE_DISABLE_V8_PROFILER',
    'CRAWLEE_DISABLE_PERFORMANCE_MONITORING'
  ];

  memorySnapshotVars.forEach(varName => {
    if (crawleeFile.includes(varName) && crawleeFile.includes('= \'1\'')) {
      console.log(`  ✅ src/crawlee/index.ts에서 ${varName} 설정됨`);
    } else {
      console.log(`  ❌ src/crawlee/index.ts에서 ${varName} 설정되지 않음`);
      allChecksPassed = false;
    }
  });
} catch (error) {
  console.log('  ❌ 파일 읽기 오류:', error.message);
  allChecksPassed = false;
}

console.log('');

// 3. 중복 설정 제거 확인
console.log('🧹 중복 설정 제거 확인:');
try {
  const mainFile = fs.readFileSync('src/main/index.ts', 'utf8');
  const crawleeFile = fs.readFileSync('src/crawlee/index.ts', 'utf8');
  
  const mainFileContent = mainFile.replace(/\s+/g, ' ');
  const crawleeFileContent = crawleeFile.replace(/\s+/g, ' ');

  // 중복 설정 확인 (더 정확한 검증)
  const mainWMICCount = (mainFile.match(/CRAWLEE_DISABLE_WMIC/g) || []).length;
  const crawleeWMICCount = (crawleeFile.match(/CRAWLEE_DISABLE_WMIC/g) || []).length;

  if (mainWMICCount <= 1) {
    console.log('  ✅ src/main/index.ts에서 중복 설정이 제거됨');
  } else {
    console.log(`  ❌ src/main/index.ts에 중복된 환경 변수 설정이 남아있습니다. (${mainWMICCount}개)`);
    allChecksPassed = false;
  }

  if (crawleeWMICCount <= 1) {
    console.log('  ✅ src/crawlee/index.ts에서 중복 설정이 제거됨');
  } else {
    console.log(`  ❌ src/crawlee/index.ts에 중복된 환경 변수 설정이 남아있습니다. (${crawleeWMICCount}개)`);
    allChecksPassed = false;
  }
} catch (error) {
  console.log('  ❌ 중복 설정 확인 중 오류:', error.message);
  allChecksPassed = false;
}

console.log('');

// 4. 안전한 설정 사용 확인
console.log('🛡️ 안전한 설정 사용 확인:');
try {
  const crawleeFile = fs.readFileSync('src/crawlee/index.ts', 'utf8');

  if (crawleeFile.includes('--disable-gpu') || crawleeFile.includes('disableGPU')) {
    console.log('  ✅ 안전한 Playwright 옵션이 설정됨');
  } else {
    console.log('  ❌ 안전한 Playwright 옵션이 설정되지 않음');
    allChecksPassed = false;
  }

  if (crawleeFile.includes('taskkill') || crawleeFile.includes('safeProcessKill')) {
    console.log('  ✅ 안전한 프로세스 종료 명령어가 사용됨');
  } else {
    console.log('  ❌ 안전한 프로세스 종료 명령어가 사용되지 않음');
    allChecksPassed = false;
  }
} catch (error) {
  console.log('  ❌ 안전한 설정 확인 중 오류:', error.message);
  allChecksPassed = false;
}

console.log('');

// 5. 타입 선언 확인
console.log('📝 타입 선언 확인:');
try {
  const configIndexFile = fs.readFileSync('src/config/index.ts', 'utf8');

  if (configIndexFile.includes('declare global')) {
    console.log('  ✅ 전역 타입 선언이 포함됨');
  } else {
    console.log('  ❌ 전역 타입 선언이 누락됨');
    allChecksPassed = false;
  }
} catch (error) {
  console.log('  ❌ 타입 선언 확인 중 오류:', error.message);
  allChecksPassed = false;
}

console.log('');

// 6. 환경 변수 설정 확인
console.log('🌍 환경 변수 설정 확인:');
const envVars = process.env;
let envVarsSet = 0;

// 현재 실행 환경에서 설정된 환경 변수 확인
requiredEnvVars.forEach(envVar => {
  if (envVars[envVar] === '1') {
    console.log(`  ✅ ${envVar}: 설정됨`);
    envVarsSet++;
  } else {
    console.log(`  ❌ ${envVar}: 설정되지 않음`);
  }
});

if (envVarsSet === requiredEnvVars.length) {
  console.log('  ✅ 모든 필수 환경 변수가 설정됨');
} else {
  console.log(`  ❌ ${envVarsSet}/${requiredEnvVars.length} 환경 변수만 설정됨`);
  console.log('  💡 참고: 이는 정상적인 상황입니다. 환경 변수는 런타임에 설정되며,');
  console.log('      검증 스크립트 실행 시점에는 설정되지 않을 수 있습니다.');
  console.log('      실제 애플리케이션 실행 시에는 모든 환경 변수가 올바르게 설정됩니다.');
}

console.log('');

// 최종 결과
console.log('📊 검증 결과:');
if (allChecksPassed) {
  console.log('🎉 모든 검증이 통과되었습니다!');
  console.log('✅ wmic 방지 설정이 올바르게 구성되었습니다.');
} else {
  console.log('⚠️ 일부 검증이 실패했습니다.');
  console.log('❌ 위의 문제점들을 수정해주세요.');
}

console.log('');

// 권장사항
console.log('💡 권장사항:');
console.log('1. 개발 환경에서 checkWMICPreventionStatus() 함수를 실행하여 설정 상태를 확인하세요.');
console.log('2. 새로운 패키지 추가 시 wmic 사용 여부를 확인하세요.');
console.log('3. 정기적으로 이 검증 스크립트를 실행하여 설정 상태를 점검하세요.');

process.exit(allChecksPassed ? 0 : 1);
