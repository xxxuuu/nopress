import { execSync } from 'node:child_process';

// 模块级缓存：同一进程内只执行一次 git 命令，避免 dev 模式每次渲染都 fork 子进程
let cachedCommitSha: string | null = null;

/**
 * 获取构建时的 Git 短 commit SHA
 *
 * 读取构建机的 git 元数据（本地 dev 与 CI 的 actions/checkout 均可用）。
 * 工作区有未提交改动（含未跟踪文件）时返回空字符串——此时构建产物不再
 * 对应 HEAD，显示该 commit id 会失真。非 git 环境同样返回空字符串，
 * 由调用方决定是否展示。
 */
export function getBuildCommitSha(): string {
  if (cachedCommitSha !== null) {
    return cachedCommitSha;
  }

  let sha = '';
  try {
    // stdio 抑制 stderr，避免无 .git 时向构建日志输出报错
    const output = execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const trimmed = output.trim();
    // 仅接受十六进制 hash，防止命令异常时输出脏数据
    if (/^[0-9a-f]{7,40}$/i.test(trimmed)) {
      // 有输出即视为脏（含 ?? 未跟踪行）；gitignore 的构建产物不计入
      const dirty = execSync('git status --porcelain', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (!dirty) {
        sha = trimmed;
      }
    }
  } catch {
    // 非 git 环境保持为空
  }

  cachedCommitSha = sha;
  return sha;
}
