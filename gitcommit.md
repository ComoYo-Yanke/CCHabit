# Git 日常开发速查手册

> 拿上就能复制粘贴。假设远程仓库为 `origin`，主分支为 `main`。

---

## 一、最常用（背下来）

```bash
# 看当前状态
git status

# 拉取 main 最新
git checkout main && git pull

# 开新功能分支
git checkout -b feature/xxx

# 提交
git add .
git commit -m "feat: xxx"

# 推送
git push -u origin feature/xxx
```

---

## 二、分支操作

### 查看分支

```bash
git branch                  # 本地分支
git branch -r               # 远程分支
git branch -a               # 全部
git branch -vv              # 本地 + 跟踪的远程 + 最后 commit
```

### 切换分支

```bash
git checkout main           # 切到 main
git switch main             # 同上（新语法，推荐）
git checkout -              # 切回上一个分支
```

### 创建并切换

```bash
git checkout -b feature/xxx           # 从当前分支切出
git switch -c feature/xxx             # 同上（新语法）
git checkout -b feature/xxx origin/main   # 从远程 main 切出
```

### 删除分支

```bash
git branch -d feature/xxx             # 本地（已合并）
git branch -D feature/xxx             # 本地（强制，未合并也删）
git push origin --delete feature/xxx  # 远程
```

### 重命名分支

```bash
git branch -m old-name new-name       # 本地
git push origin --delete old-name     # 删远程旧名
git push -u origin new-name           # 推远程新名
```

---

## 三、拉取分支

### 场景 1：远程已有分支，本地要拉下来

```bash
git fetch origin                      # 拉取所有远程信息
git checkout feature/xxx              # 自动跟踪 origin/feature/xxx
# 或显式：
git checkout -b feature/xxx origin/feature/xxx
```

### 场景 2：本地分支，拉远程更新

```bash
git checkout feature/xxx
git pull                              # = fetch + merge
git pull --rebase                     # = fetch + rebase（推荐，历史干净）
```

### 场景 3：只拉远程信息，不动工作区

```bash
git fetch origin
git log HEAD..origin/main --oneline   # 看 main 多了哪些 commit
```

### 场景 4：拉取远程新增的分支列表

```bash
git fetch                             # 只拉取远程新增的分支列表
git fetch --prune                     # 同时清理已删除的远程分支引用
```

---

## 四、提交

```bash
git add <文件>              # 添加指定文件
git add .                   # 添加所有改动
git add -p                  # 交互式选择要提交的片段
git commit -m "feat: xxx"   # 提交
git commit --amend          # 修改最近一次提交（未推送时）
```

**Commit 规范**：`<type>(<scope>): <subject>`

```
feat:     新功能
fix:      修 Bug
docs:     文档
style:    格式
refactor: 重构
perf:     性能
test:     测试
chore:    杂项
```

---

## 五、推送

```bash
git push                              # 推送当前分支
git push -u origin feature/xxx        # 首次推送并建立跟踪
git push --force-with-lease           # rebase 后强推（比 --force 安全）
git push origin --delete feature/xxx  # 删除远程分支
```

---

## 六、同步 main（合并前必做）

```bash
git fetch origin
git rebase origin/main                # 推荐：历史线性
# 或
git merge origin/main                 # 保留分叉
```

**冲突处理**：

```bash
# 手动编辑冲突文件后
git add <冲突文件>
git rebase --continue                 # rebase 场景
git merge --continue                  # merge 场景

# 放弃
git rebase --abort
git merge --abort
```

---

## 七、撤销

```bash
# 撤销工作区改动（未 add）
git checkout -- <文件>
git restore <文件>                    # 新语法

# 撤销暂存（已 add，未 commit）
git reset HEAD <文件>
git restore --staged <文件>           # 新语法

# 撤销提交（未推送）
git reset --soft HEAD~1               # 保留改动，取消提交
git reset --hard HEAD~1               # 丢弃改动 ⚠️

# 撤销提交（已推送）
git revert <hash>                     # 生成反向提交，安全
```

---

## 八、临时保存

```bash
git stash                  # 暂存当前改动
git stash -u               # 连未跟踪文件
git stash list             # 查看
git stash pop              # 恢复并删除
git stash apply            # 恢复但保留
git stash drop             # 删除某条
```

---

## 九、查看历史

```bash
git log --oneline                     # 简洁
git log --oneline --graph --all       # 图形化全分支
git log -p <文件>                     # 某文件改动历史
git diff                              # 工作区 vs 暂存区
git diff --staged                     # 暂存区 vs 上次提交
git diff main..feature/xxx            # 两分支差异
git blame <文件>                      # 谁改的
```

---

## 十、救急

```bash
# 误删分支 / reset 过头
git reflog
git checkout <hash>
git branch recover <hash>

# 找哪个 commit 引入 Bug
git bisect start
git bisect bad
git bisect good v1.0.0
git bisect reset

# 挑单个 commit 到当前分支
git cherry-pick <hash>
```

---

## 十一、完整开发流（一次复制）

```bash
# ① 同步 main
git checkout main
git pull

# ② 开分支
git checkout -b feature/xxx

# ③ 开发 + 提交
git add .
git commit -m "feat: xxx"

# ④ 同步 main
git fetch origin
git rebase origin/main

# ⑤ 推送
git push -u origin feature/xxx

# ⑥ 去 GitHub 提 PR

# ⑦ 合并后清理
git checkout main
git pull
git branch -d feature/xxx
git push origin --delete feature/xxx
```

---

## 十二、高频场景速查

| 我想… | 命令 |
|--------|------|
| 看当前状态 | `git status` |
| 切分支 | `git switch main` |
| 开新分支 | `git switch -c feature/xxx` |
| 拉远程分支 | `git fetch && git checkout feature/xxx` |
| 拉最新代码 | `git pull --rebase` |
| 提交 | `git add . && git commit -m "feat: xxx"` |
| 推分支 | `git push -u origin feature/xxx` |
| 同步 main | `git fetch && git rebase origin/main` |
| 撤销未提交改动 | `git restore .` |
| 撤销最近提交 | `git reset --soft HEAD~1` |
| 临时保存 | `git stash` / `git stash pop` |
| 删本地分支 | `git branch -d feature/xxx` |
| 删远程分支 | `git push origin --delete feature/xxx` |
| 强推（rebase 后） | `git push --force-with-lease` |
| 找回丢失提交 | `git reflog` |

---

## 十三、三条铁律

1. **动手前先 `git checkout main && git pull`**
2. **一个分支只做一件事，1～3 天内合并**
3. **合并前 `git fetch && git rebase origin/main`**

---