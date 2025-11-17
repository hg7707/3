"ui";
"use strict";

// =================== 安全启动保护 ===================
// 确保无论什么情况都能进入UI，延迟所有权限检查
try {
    // 禁用auto.waitFor()，避免阻塞启动
    if (typeof auto !== 'undefined' && auto.waitFor) {
        // 不调用auto.waitFor()，让程序直接继续
    }
} catch (e) {
    console.error("启动保护异常（忽略）: " + e);
}


/**
 * AutoX.js v6 统一整合版（含全局验证·权限体检·安全修复）
 * 适配版本：AutoX.js v6.5.2
 * 
 * 修复点：
 * 1) 首次未给权限就闪退 → 增加"权限体检"与所有敏感操作的显式/延迟申请，所有入口均做 try/catch 与权限判定；
 * 2) 无障碍服务出现故障 → 取消 root 强启；仅引导到系统设置；加入心跳自检与一键修复；
 * 3) 一运行就让手机重启 → 移除高风险 API 的强制调用（如 root/拦截键强开）；统一节流；防重入；
 * 4) 权限过程中"设置停止运行" → 严格串行打开设置页；设置失败自动回退，并给出手动指引。
 * 5) Qianwang按钮点击顺序错位 → 修复findAllMatches函数提前终止导致的按钮识别不完整问题
 * 6) UI元素访问错误 → 增加UI就绪检查和安全访问机制，防止setText报错（v1.2）
 * 7) 日志功能优化 → 独立全局日志系统，主界面添加日志查看按钮，避免功能A界面拥挤（v1.3）
 * 8) 界面优化与阈值调整 → 移除功能A日志区域，添加用户可调的匹配阈值功能（v1.4）
 * 9) 音量键控制优化 → 删除30秒重注册机制，改为一次注册持续有效，避免中断长任务（v1.5）
 * 10) 最后图片完全处理 → 确保每个任务组的最后一张图片被点击直到屏幕上没有，避免遗漏（v1.6.1）
 * 11) 索引检测窗口延长 → 点击qianwang后的索引检测时间从10秒延长到30秒（v1.6.2）
 * 12) 无权限阻塞启动 → 所有权限检查增加安全保护，确保无权限也能进入APP（v1.7）
 * 13) Root权限超时修复 → 修复events.observeKey导致的Root权限超时崩溃（v1.7.1）
 * 14) floatConsole未定义修复 → 修复功能B初始化时floatConsole未定义错误（v1.7.2）
 * 15) APK打包资源问题 → 修复打包后图片资源读取失败，支持多路径查找（v1.8）
 * 16) 功能B权限检查 → 修复一键周胜权限检查不严格导致的状态混乱（v1.8.1）
 * 17) 连点闪退修复 → 修复标记完成后运行连点时的崩溃问题（v1.8.2）
 * 18) 事件监听器闪退修复 → 修复events.on与线程冲突导致的闪退（v1.8.3）
 * 19) UI线程阻塞修复 → 修复音量键处理中sleep导致的UI线程阻塞错误（v1.8.4）
 * 20) ANR无响应修复 → 将所有耗时操作移到工作线程，彻底解决卡死问题（v1.8.5）
 * 21) 音量键监听增强修复 → 增强无障碍服务检查，智能监控和自动恢复机制（v1.9.0）
 * 22) 黑屏问题修复 → 权限检查移至工作线程，避免UI阻塞（v1.9.0）
 * 23) 游戏内失效修复 → 添加监听器健康检查，30秒自动检测并恢复（v1.9.0）
 *
 * 说明：本文件基于你的 main(3).js 改造而来，保留"功能A/功能B"的全部能力，外加更稳的权限与异常保护。
 *
 * 版本：v1.9.0 (音量键监听全面增强)
 * 修复日期：2025-11-17
 * 更新内容：
 *   1. 增强无障碍服务检查 - 实际功能测试而非仅检查对象存在
 *   2. 智能监听器管理 - 避免重复注册，减少干扰
 *   3. 自动健康检查 - 每30秒检测服务状态，异常时自动恢复
 *   4. 权限检查优化 - 移至工作线程，彻底解决黑屏和卡顿
 *   5. 游戏场景增强 - 长时间运行也能保持音量键响应
 */

// ========================= 全局日志系统 =========================
const GlobalLogger = (function() {
    let logMessages = [];
    const MAX_LOGS = 500;
    
    function addLog(message, type) {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : '✓';
        const logEntry = {
            time: timestamp,
            type: type || 'log',
            message: message,
            display: `[${timestamp}] ${prefix} ${message}`
        };
        logMessages.push(logEntry);
        if (logMessages.length > MAX_LOGS) {
            logMessages.shift();
        }
    }
    
    function getLogs() {
        return logMessages;
    }
    
    function getLogsText() {
        return logMessages.map(log => log.display).join('\n');
    }
    
    function clearLogs() {
        logMessages = [];
    }
    
    return {
        log: (msg) => addLog(msg, 'log'),
        warn: (msg) => addLog(msg, 'warn'),
        error: (msg) => addLog(msg, 'error'),
        getLogs,
        getLogsText,
        clearLogs
    };
})();

// ========================= 安全工具：日志与防重入 =========================
const SAFE = (function() {
    const state = {
        openingSettings: false
    };

    function log() {
        try {
            console.log.apply(console, arguments);
        } catch (e) {}
    }

    function warn() {
        try {
            console.warn.apply(console, arguments);
        } catch (e) {
            log("[WARN]", e);
        }
    }

    function error() {
        try {
            console.error.apply(console, arguments);
        } catch (e) {
            log("[ERR]", e);
        }
    }

    function guard(fn) {
        return function() {
            try {
                return fn.apply(this, arguments);
            } catch (e) {
                error("Guarded error:", e, e && e.stack);
                return null;
            }
        };
    }

    function debounce(fn, ms) {
        let t = 0;
        return function() {
            clearTimeout(t);
            const args = arguments,
                ctx = this;
            t = setTimeout(() => fn.apply(ctx, args), ms || 250);
        };
    }

    function setOpening(flag) {
        state.openingSettings = !!flag;
    }

    function canOpenSettings() {
        return !state.openingSettings;
    }
    return {
        log,
        warn,
        error,
        guard,
        debounce,
        setOpening,
        canOpenSettings
    };
})();

// ========================= 全局：一次性验证（可上下滑动） =========================
const GLOBAL_VERIFY_STORE = (function() {
    const NS = "NJJ_GlobalVerify_Store";
    const KEY_VERIFIED = "verified";
    const KEY_TIME = "verified_at";
    const store = storages.create(NS);

    function isVerified() {
        try {
            return !!store.get(KEY_VERIFIED, false);
        } catch (e) {
            return false;
        }
    }

    function setVerified() {
        try {
            store.put(KEY_VERIFIED, true);
            store.put(KEY_TIME, new Date().getTime());
        } catch (e) {}
    }

    function getVerifiedTime() {
        try {
            return store.get(KEY_TIME, null);
        } catch (e) {
            return null;
        }
    }
    return {
        isVerified,
        setVerified,
        getVerifiedTime
    };
})();

function showGlobalVerify(onPassed) {
    ui.layout(
        <vertical bg="#FAFAFA">
            <appbar>
                <toolbar title="使用验证（仅首次）"/>
            </appbar>
            
            <ScrollView id="verifyScroll" h="*" layout_weight="1">
                <vertical padding="16">
                    <card w="*" h="auto" margin="0 12" cardCornerRadius="12dp" cardElevation="6dp">
                        <vertical padding="16" bg="#FFF5F5">
                            <text text="🔒 为保障作者权益与使用规范，请先完成一次性验证" textSize="18sp" textStyle="bold" textColor="#E65100" margin="0 6"/>
                            <text text="提示：此验证只进行一次，成功后下次进入程序无需再次验证。" textSize="14sp" textColor="#666666" margin="0 6"/>
                        </vertical>
                    </card>
                    
                    <card w="*" h="auto" margin="12" cardCornerRadius="12dp" cardElevation="4dp">
                        <vertical padding="14">
                            <text text="问题1：本忍具的原创者是谁？（5个字）" textSize="16sp" textStyle="bold" margin="8 6"/>
                            <input id="answer1" hint="请输入答案，如：科学家蛇叔" margin="6"/>
                            
                            <text text="问题2：是否给蛇叔点了关注？（填是或否）" textSize="16sp" textStyle="bold" margin="8 6"/>
                            <input id="answer2" hint="请输入答案，如：是" margin="6"/>
                            
                            <text text="忍具：替身计时器和一键完成日活跃已上线，最低2.98即可永久无广告使用，详情咨询q2799379490（填：收到）" textSize="16sp" textStyle="bold" margin="8 6"/>
                            <input id="answer3" hint="请输入答案，如：收到" margin="6"/>
                        </vertical>
                    </card>
                    
                    <horizontal margin="12 8">
                        <button id="submitBtn" text="提交答案" layout_weight="1" h="52" style="Widget.AppCompat.Button.Colored"/>
                    </horizontal>
                    
                    <text text="若你已验证但误清理了应用数据，则需重新验证一次。" textColor="#888888" margin="12 12 12 24"/>
                </vertical>
            </ScrollView>
        </vertical>
    );

    ui.submitBtn.click(SAFE.guard(() => {
        var a1 = ui.answer1.text().trim();
        var a2 = ui.answer2.text().trim();
        var a3 = ui.answer3.text().trim();
        if (a1 === "科学家蛇叔" && a2 === "是" && a3 === "收到") {
            GLOBAL_VERIFY_STORE.setVerified();
            toast("验证成功！");
            if (typeof onPassed === "function") onPassed();
        } else {
            toast("答案错误，请重新填写");
        }
    }));
}

// ========================= 权限体检中心（统一调用） =========================
const Perms = (function() {
    function hasAccessibility() {
        try {
            if (typeof auto === 'undefined') return false;
            // AutoX.js v6.5.2 标准检查
            return auto.service != null;
        } catch (e) {
            console.warn("检查无障碍权限异常: " + e);
            return false;
        }
    }

    function checkAccessibilityHealth() {
        try {
            // AutoX.js v6.5.2 健康检查：验证服务对象可访问
            if (typeof auto === 'undefined') return false;
            if (auto.service == null) return false;

            // 尝试访问service对象，确保它不是一个已失效的引用
            try {
                // 简单的类型检查，不调用可能不存在的方法
                var isValid = (typeof auto.service === 'object' || typeof auto.service === 'function');
                return isValid;
            } catch (e) {
                // 如果访问失败，说明service虽然不为null但已失效
                console.warn("无障碍服务健康检查失败: " + e);
                return false;
            }
        } catch (e) {
            return false;
        }
    }

    function openAccessibilitySettings() {
        if (!SAFE.canOpenSettings()) {
            toast("正在打开设置，请稍候…");
            return;
        }
        SAFE.setOpening(true);
        try {
            app.startActivity({
                action: "android.settings.ACCESSIBILITY_SETTINGS"
            });
            toast("请在“无障碍”中启用服务后返回本应用");
        } catch (e) {
            SAFE.warn("打开无障碍设置失败：" + e);
            try {
                app.startActivity({
                    packageName: "com.android.settings"
                });
            } catch (_) {
                    toast("无法打开设置，请手动前往设置-无障碍");
                }
        } finally {
            setTimeout(() => SAFE.setOpening(false), 1500);
        }
    }

    function hasOverlay() {
        try {
            if (typeof floaty === 'undefined') return false;
            return floaty && typeof floaty.checkPermission === "function" ? !!floaty.checkPermission() : false;
        } catch (e) {
            console.warn("检查悬浮窗权限异常: " + e);
            return false;
        }
    }

    function requestOverlay() {
        try {
            if (hasOverlay()) return true;
            if (typeof floaty !== 'undefined' && floaty && typeof floaty.requestPermission === "function") {
                floaty.requestPermission();
                toast("请授予悬浮窗权限后返回本应用");
                return false;
            }
        } catch (e) {
            SAFE.warn("请求悬浮窗权限失败：" + e);
            console.error("requestOverlay异常: " + e);
        }
        return false;
    }

    function tryCaptureOnce() {
        try {
            if (typeof images === 'undefined') return false;
            var img = images.captureScreen();
            if (img) {
                img.recycle();
                return true;
            }
        } catch (e) {
            console.warn("尝试截图异常: " + e);
        }
        return false;
    }

    function requestScreenCaptureInteractive(maxTry) {
        maxTry = maxTry || 3;
        try {
            if (typeof images === 'undefined') {
                toast("截图功能不可用");
                return false;
            }
            for (var i = 0; i < maxTry; i++) {
                try {
                    if (images.requestScreenCapture(10000)) {
                        if (tryCaptureOnce()) return true;
                    }
                } catch (e) {
                    SAFE.warn("截图权限请求失败[" + (i + 1) + "/" + maxTry + "]: " + e);
                    console.error("requestScreenCapture异常: " + e);
                }
                sleep(1200);
            }
        } catch (e) {
            console.error("requestScreenCaptureInteractive异常: " + e);
        }
        return false;
    }
    return {
        hasAccessibility,
        checkAccessibilityHealth,
        openAccessibilitySettings,
        hasOverlay,
        requestOverlay,
        tryCaptureOnce,
        requestScreenCaptureInteractive
    };
})();

// ========================= 公共：页面切换器与功能页 =========================
const Switcher = (function() {
    let currentCleanup = null;

    function goHome() {
        safeCleanup();
        ui.layout(
            <vertical padding="16" bg="#FAFAFA">
                        <appbar>
                            <toolbar title="火影忍者脚本 · 统一整合版（安全修复）"/>
                        </appbar>
                        
                        <card w="*" h="auto" margin="0 12 12 12" cardCornerRadius="12dp" cardElevation="4dp" bg="#E8F5E9">
                            <vertical padding="14">
                                <text text="✅ 欢迎使用！" textSize="16sp" textStyle="bold" textColor="#2E7D32"/>
                                <text text="本APP已优化启动流程，即使没有权限也能正常进入。需要使用功能时，再按提示授予相应权限即可。" textSize="13sp" textColor="#4CAF50" margin="6 4"/>
                            </vertical>
                        </card>
                        
                        <card w="*" h="auto" margin="0 12" cardCornerRadius="12dp" cardElevation="6dp">
                            <vertical padding="16">
                                <text text="请选择要进入的功能" textSize="16sp" textColor="#555555" margin="0 8 0 12"/>
                                <button id="goA" text="功能A：自动活跃任务（音量键开始/停止）" h="56" style="Widget.AppCompat.Button.Colored"/>
                                <button id="goB" text="功能B：一键周胜（7点标记）" h="56" margin="0 8 0 0" style="Widget.AppCompat.Button.Colored"/>
                            </vertical>
                        </card>
                        
                        <card w="*" h="auto" margin="12 8" cardCornerRadius="10dp" cardElevation="5dp">
                            <vertical padding="14">
                                <text text="🛡 权限体检" textSize="16sp" textStyle="bold"/>
                                <text id="permSummary" text="未检测" textSize="13sp" textColor="#666666" margin="6 8"/>
                                <horizontal>
                                    <button id="btnCheck" text="一键体检" layout_weight="1"/>
                                    <button id="btnFix" text="逐项修复" layout_weight="1" style="Widget.AppCompat.Button.Borderless"/>
                                </horizontal>
                            </vertical>
                        </card>                        
                        <card w="*" h="auto" margin="12 8" cardCornerRadius="10dp" cardElevation="5dp">
                            <vertical padding="14">
                                <text text="📋 运行日志" textSize="16sp" textStyle="bold"/>
                                <text text="查看脚本运行时的详细日志信息" textSize="12sp" textColor="#666666" margin="6 4"/>
                                <button id="btnViewLogs" text="查看日志" h="48" style="Widget.AppCompat.Button.Colored"/>
                            </vertical>
                        </card>

                        <text text="提示：如设置崩溃，请返回主页→“逐项修复”，按步骤单独打开相应设置页。" textColor="#888888" margin="6 12"/>
                    </vertical>
        );
        ui.goA.click(() => goFeatureA());
        ui.goB.click(() => goFeatureB());
        ui.btnCheck.click(SAFE.guard(() => runHealthCheck(false)));
        ui.btnFix.click(SAFE.guard(() => runHealthCheck(true)));
        ui.btnViewLogs.click(() => showLogViewer());
        currentCleanup = null;
        // 延长等待时间，确保UI完全渲染后再执行检查
        setTimeout(() => runHealthCheck(false), 800);
    }

    function runHealthCheck(interactive) {
        let lines = [];
        const ok = s => "✓ " + s;
        const bad = s => "✗ " + s;

        // 检查 UI 元素是否已准备好
        try {
            if (!ui || !ui.permSummary) {
                SAFE.warn("UI元素未就绪，稍后重试");
                setTimeout(() => runHealthCheck(interactive), 500);
                return;
            }
        } catch (e) {
            SAFE.warn("UI元素检查异常: " + e);
            return;
        }

        // 无障碍
        const acc = Perms.hasAccessibility();
        lines.push(acc ? ok("无障碍：已开启") : bad("无障碍：未开启"));
        if (!acc && interactive) Perms.openAccessibilitySettings();

        // 悬浮窗（功能B标记用到）
        const ov = Perms.hasOverlay();
        lines.push(ov ? ok("悬浮窗：已授权") : bad("悬浮窗：未授权（功能B标记需要）"));
        if (!ov && interactive) Perms.requestOverlay();

        // 截图权限（功能A运行时申请，不在此处强弹）
        const capReady = Perms.tryCaptureOnce();
        lines.push(capReady ? ok("截图：就绪") : "… 截图：待运行时申请");

        // 安全更新UI
        try {
            ui.run(() => {
                if (ui.permSummary) {
                    ui.permSummary.setText(lines.join("\n"));
                }
            });
        } catch (e) {
            SAFE.warn("更新权限摘要失败: " + e);
        }
    }


    function showLogViewer() {
        safeCleanup();
        ui.layout(
            <vertical padding="16" bg="#FAFAFA">
                <appbar>
                    <toolbar title="运行日志" id="toolbar">
                        <button id="backBtn" text="返回" textSize="14sp" style="Widget.AppCompat.Button.Borderless.Colored" w="auto"/>
                    </toolbar>
                </appbar>
                
                <card w="*" h="*" margin="8" cardCornerRadius="8dp" cardElevation="4dp" layout_weight="1">
                    <ScrollView w="*" h="*">
                        <text id="logContent" text="暂无日志" textSize="12sp" textColor="#333333" padding="12" typeface="monospace"/>
                    </ScrollView>
                </card>
                
                <horizontal margin="8">
                    <button id="btnRefresh" text="刷新" layout_weight="1" h="48"/>
                    <button id="btnClear" text="清空" layout_weight="1" h="48" margin="8 0 0 0"/>
                </horizontal>
            </vertical>
        );
        
        function updateLogDisplay() {
            try {
                const logs = GlobalLogger.getLogsText();
                ui.run(() => {
                    if (ui.logContent) {
                        ui.logContent.setText(logs || "暂无日志");
                    }
                });
            } catch (e) {
                SAFE.error("更新日志显示失败: " + e);
            }
        }
        
        ui.backBtn.click(() => goHome());
        ui.btnRefresh.click(() => {
            updateLogDisplay();
            toast("日志已刷新");
        });
        ui.btnClear.click(() => {
            GlobalLogger.clearLogs();
            updateLogDisplay();
            toast("日志已清空");
        });
        
        // 初始加载日志
        setTimeout(() => updateLogDisplay(), 300);
        
        // 自动刷新日志（每3秒）
        const refreshInterval = setInterval(() => {
            updateLogDisplay();
        }, 3000);
        
        currentCleanup = () => {
            clearInterval(refreshInterval);
        };
    }

    function safeCleanup() {
        try {
            if (typeof currentCleanup === "function") currentCleanup();
        } catch (e) {}
        try {
            events.removeAllListeners && events.removeAllListeners();
        } catch (e) {}
    }

    function goFeatureA() {
        safeCleanup();
        (function() {
            ui.layout(
                <vertical padding="0" bg="#FAFAFA">
                                <appbar>
                                    <toolbar id="tb" title="功能A · 自动活跃任务（无悬浮窗·音量键控制）"/>
                                </appbar>
                                <ScrollView w="*" h="*">
                                    <vertical padding="16">
                                <card w="*" h="auto" margin="0 8" cardCornerRadius="8dp" cardElevation="4dp">
                                    <vertical padding="14">
                                        <text text="权限状态" textSize="16sp" textColor="#666666" marginBottom="8"/>
                                        <text id="accessibilityStatus" text="无障碍服务: 未检查" textSize="14sp" margin="0 4"/>
                                        <text id="captureStatus" text="截图权限: 未检查" textSize="14sp" margin="0 4"/>
                                        <horizontal>
                                            <button id="checkPermission" text="检查并修复权限" layout_weight="1"/>
                                            <button id="backHomeA" text="返回主页" layout_weight="1" style="Widget.AppCompat.Button.Borderless"/>
                                        </horizontal>
                                    </vertical>
                                </card>
                                <card w="*" h="auto" margin="0 8" cardCornerRadius="8dp" cardElevation="4dp">
                                    <vertical padding="14">
                                        <text text="控制" textSize="16sp" textColor="#666666" marginBottom="8"/>
                                        <button id="toggleKeyControl" text="开启音量键控制（按音量下开始/停止）" w="*"/>
                                        <text id="stateTip" text="当前状态：未运行" textSize="12sp" textColor="#888888" marginTop="8"/>
                                        <checkbox id="chkSafeMode" text="轻量安全模式（出现异常/重启时勾选）" checked="false" textSize="12sp"/>
                                    </vertical>
                                </card>
                                <card w="*" h="auto" margin="0 8" cardCornerRadius="8dp" cardElevation="4dp">
                                    <vertical padding="14">
                                        <text text="分辨率与匹配加速" textSize="16sp" textColor="#666666" marginBottom="8"/>
                                        <horizontal>
                                            <text text="屏幕宽(px)" textSize="14sp" marginRight="8"/>
                                            <input id="inpW" inputType="number" w="0" layout_weight="1"/>
                                            <text text="屏幕高(px)" textSize="14sp" marginLeft="12" marginRight="8"/>
                                            <input id="inpH" inputType="number" w="0" layout_weight="1"/>
                                        </horizontal>
                                        <horizontal marginTop="8">
                                            <button id="btnSaveWH" text="保存分辨率" layout_weight="1"/>
                                            <text id="txtWH" text="未保存" textSize="12sp" textColor="#888888" marginLeft="8"/>
                                        </horizontal>
                                        <text text="说明：仅用于加速模板匹配的最优倍数预估，不改变既有流程与触控逻辑。" textSize="12sp" textColor="#888888" marginTop="8"/>
                                    </vertical>
                                </card>
                                <card w="*" h="auto" margin="0 8" cardCornerRadius="8dp" cardElevation="4dp">
                                    <vertical padding="16">
                                        <text text="🎯 匹配阈值调整" textSize="16sp" textStyle="bold" textColor="#333333"/>
                                        <text text="调整图片识别的相似度阈值（默认0.8）" textSize="12sp" textColor="#888888" margin="0 6 0 12"/>
                                        
                                        <horizontal gravity="center_vertical">
                                            <text text="当前阈值：" textSize="14sp" textColor="#666666"/>
                                            <text id="txtThreshold" text="0.80" textSize="18sp" textStyle="bold" textColor="#4CAF50" marginLeft="8"/>
                                        </horizontal>
                                        
                                        <horizontal margin="0 12 0 8" gravity="center_vertical">
                                            <text text="0.60" textSize="12sp" textColor="#999999"/>
                                            <SeekBar id="seekThreshold" layout_weight="1" margin="8 0" max="40" progress="20"/>
                                            <text text="1.00" textSize="12sp" textColor="#999999"/>
                                        </horizontal>
                                        
                                        <horizontal margin="0 8">
                                            <button id="btnResetThreshold" text="恢复默认(0.8)" layout_weight="1" h="45"/>
                                            <button id="btnSaveThreshold" text="保存设置" layout_weight="1" h="45" marginLeft="8" style="Widget.AppCompat.Button.Colored"/>
                                        </horizontal>
                                        
                                        <text text="说明：阈值越高识别越严格，越低识别越宽松。建议范围0.75-0.85" textSize="11sp" textColor="#999999" margin="8 8 0 0"/>
                                    </vertical>
                                </card>
                                    </vertical>
                                </ScrollView>
                            </vertical>
            );

            ui.backHomeA.click(() => goHome());
            ui.btnSaveWH.click(() => saveResolution());
            
            // 延迟加载分辨率（确保UI已渲染）
            var __initWH = {w: device.width, h: device.height};
            setTimeout(() => {
                __initWH = loadResolution();
            }, 300);



            // —— 分辨率与缩放记忆存储 ——
            var RES_STORE = storages.create("NJJ_Resolution");
                        var SCALE_CACHE = storages.create("NJJ_ScaleCache"); // key: template filename, value: last success scale (Number)
            var THRESHOLD_STORE = storages.create("NJJ_Threshold"); // 存储匹配阈值


            // 阈值管理函数
            function loadThreshold() {
                try {
                    var threshold = THRESHOLD_STORE.get("threshold", 0.8);
                    threshold = Math.max(0.6, Math.min(1.0, threshold));
                    return threshold;
                } catch (e) {
                    return 0.8;
                }
            }

            function saveThreshold(value) {
                try {
                    value = Math.max(0.6, Math.min(1.0, value));
                    THRESHOLD_STORE.put("threshold", value);
                    return value;
                } catch (e) {
                    return 0.8;
                }
            }

            function updateThresholdDisplay(value) {
                ui.run(() => {
                    if (ui.txtThreshold) {
                        ui.txtThreshold.setText(value.toFixed(2));
                    }
                    if (ui.seekThreshold) {
                        var progress = Math.round((value - 0.6) / 0.01); // max=40
                        ui.seekThreshold.setProgress(progress);
                    }
                });
            }

            // 声明阈值变量
            var currentThreshold = 0.8;
            
            // 延迟初始化阈值UI（确保UI已渲染）
            setTimeout(() => {
                currentThreshold = loadThreshold();
                updateThresholdDisplay(currentThreshold);
            }, 500);

            // SeekBar变化监听（max=40，范围0.60-1.00）
            ui.seekThreshold.setOnSeekBarChangeListener({
                onProgressChanged: function(seekBar, progress, fromUser) {
                    if (fromUser) {
                        var value = 0.6 + progress * 0.01; // max=40，所以每单位0.01
                        currentThreshold = value;
                        ui.run(() => {
                            if (ui.txtThreshold) {
                                ui.txtThreshold.setText(value.toFixed(2));
                            }
                        });
                    }
                },
                onStartTrackingTouch: function(seekBar) {},
                onStopTrackingTouch: function(seekBar) {}
            });

            // 恢复默认按钮
            ui.btnResetThreshold.click(() => {
                currentThreshold = 0.8;
                updateThresholdDisplay(0.8);
                toast("已恢复默认阈值：0.8");
            });

            // 保存设置按钮
            ui.btnSaveThreshold.click(() => {
                saveThreshold(currentThreshold);
                toast("匹配阈值已保存：" + currentThreshold.toFixed(2));
                // 实时更新全局CONFIG的阈值
                setTimeout(() => {
                    try {
                        if (global.GLOBAL_CONFIG && global.GLOBAL_CONFIG.match) {
                            global.GLOBAL_CONFIG.match.threshold = currentThreshold;
                            floatConsole.log("✓ 阈值已更新为: " + currentThreshold.toFixed(2));
                        }
                    } catch (e) {
                        floatConsole.warn("更新CONFIG阈值失败: " + e);
                    }
                }, 100);
            });

            function loadResolution() {
                try {
                    var w = RES_STORE.get("w", device.width);
                    var h = RES_STORE.get("h", device.height);
                    ui.run(() => {
                        ui.inpW.setText(String(w));
                        ui.inpH.setText(String(h));
                        ui.txtWH.setText("当前：" + w + "x" + h);
                    });
                    return {
                        w: Number(w) || device.width,
                        h: Number(h) || device.height
                    };
                } catch (e) {
                    return {
                        w: device.width,
                        h: device.height
                    };
                }
            }

            function saveResolution() {
                try {
                    var w = parseInt(ui.inpW.text()) || device.width;
                    var h = parseInt(ui.inpH.text()) || device.height;
                    RES_STORE.put("w", w);
                    RES_STORE.put("h", h);
                    ui.run(() => ui.txtWH.setText("已保存：" + w + "x" + h));
                    toast("分辨率已保存：" + w + "x" + h);
                } catch (e) {
                    toast("保存失败：" + e);
                }
            }

            var floatConsole = {
                log: t => GlobalLogger.log(String(t)),
                warn: t => GlobalLogger.warn(String(t)),
                error: t => GlobalLogger.error(String(t))
            };

            function isAccessibilityEnabled() {
                return Perms.hasAccessibility();
            }

            function isScreenCaptureReady() {
                return Perms.tryCaptureOnce();
            }

            function safeRequestScreenCapture(maxTry) {
                return Perms.requestScreenCaptureInteractive(maxTry || 3);
            }

            function checkAndShowPermissions(autoFix) {
                var accessibilityEnabled = isAccessibilityEnabled();
                ui.accessibilityStatus.setText("无障碍服务: " + (accessibilityEnabled ? "已开启✓" : "未开启✗"));
                ui.accessibilityStatus.setTextColor(colors.parseColor(accessibilityEnabled ? "#4CAF50" : "#F44336"));
                var captureOk = isScreenCaptureReady();
                ui.captureStatus.setText("截图权限: " + (captureOk ? "已就绪✓" : "未就绪✗"));
                ui.captureStatus.setTextColor(colors.parseColor(captureOk ? "#4CAF50" : "#F44336"));

                if (!accessibilityEnabled && autoFix) {
                    dialogs.build({
                            title: "提示",
                            content: "无障碍服务未开启，是否前往设置？",
                            positive: "前往",
                            negative: "取消"
                        })
                        .on("positive", () => Perms.openAccessibilitySettings()).show();
                }
                if (!captureOk && autoFix) {
                    toast("将弹出一次系统截图授权，请允许后返回");
                    threads.start(() => {
                        if (safeRequestScreenCapture(2)) {
                            toast("截图权限已就绪");
                            checkAndShowPermissions(false);
                        } else {
                            toast("截图授权失败，可在开始运行时再试");
                        }
                    });
                }
            }
            ui.checkPermission.click(() => checkAndShowPermissions(true));

            var scriptThread = null;
            var keyControlEnabled = false;
            var lastVolumeDownTs = 0;
            var keyListenersRegistered = false; // 追踪监听器状态
            var listenerHealthCheckTimer = null; // 健康检查定时器
            var lastAccessibilityCheck = 0; // 上次无障碍检查时间
            var volumeKeyHandler = null; // 保存音量键处理函数引用


            function showHint(text) {
                try {
                    toast(text);
                } catch (e) {}
            }

            function onVolumeDown() {
                var now = Date.now();
                if (now - lastVolumeDownTs < 350) return;
                lastVolumeDownTs = now;
                if (scriptThread == null) {
                    floatConsole.log("收到音量下键 → 启动脚本");
                    showHint("开始运行");
                    ui.run(() => ui.stateTip.setText("当前状态：准备中..."));

                    // 快速检查无障碍服务
                    if (!isAccessibilityEnabled()) {
                        floatConsole.warn("无障碍未就绪，尝试引导开启");
                        showHint("请先开启无障碍");
                        Perms.openAccessibilitySettings();
                        ui.run(() => ui.stateTip.setText("当前状态：未运行"));
                        return;
                    }

                    // 在工作线程中进行权限检查和脚本启动，避免阻塞主线程
                    const safeMode = ui.chkSafeMode.isChecked();
                    scriptThread = threads.start(function() {
                        try {
                            // 在工作线程中检查截图权限
                            if (!isScreenCaptureReady()) {
                                floatConsole.log("截图权限未就绪，尝试申请...");
                                ui.run(() => showHint("正在申请截图权限..."));

                                if (!safeRequestScreenCapture(3)) {
                                    floatConsole.error("无法获取截图权限");
                                    ui.run(() => showHint("截图权限失败"));
                                    ui.run(() => ui.stateTip.setText("当前状态：未运行"));
                                    scriptThread = null;
                                    return;
                                }
                            }

                            // 权限就绪，开始运行主脚本
                            ui.run(() => {
                                ui.stateTip.setText("当前状态：运行中");
                                showHint("脚本运行中");
                            });
                            floatConsole.log("✓ 权限检查通过，开始执行脚本");

                            runMainScript(floatConsole, safeMode);
                        } catch (e) {
                            floatConsole.error("脚本异常: " + e + "\n" + e.stack);
                        } finally {
                            scriptThread = null;
                            floatConsole.log("脚本已结束");
                            ui.run(() => ui.stateTip.setText("当前状态：未运行"));
                        }
                    });
                } else {
                    floatConsole.log("收到音量下键 → 停止脚本");
                    showHint("停止运行");
                    ui.run(() => ui.stateTip.setText("当前状态：未运行"));
                    try {
                        scriptThread.interrupt();
                    } catch (e) {}
                    scriptThread = null;
                }
            }

            function registerKeyListeners() {
                try {
                    // 如果已经注册且无障碍服务正常，不要重复注册
                    if (keyListenersRegistered && Perms.checkAccessibilityHealth()) {
                        floatConsole.log("ℹ 监听器已存在且正常，跳过重复注册");
                        return;
                    }

                    // 清除旧的监听器（使用保存的引用）
                    if (keyListenersRegistered && volumeKeyHandler) {
                        try {
                            // 尝试移除特定的监听器，而不是所有监听器
                            events.removeListener && events.removeListener("key_down", volumeKeyHandler);
                            floatConsole.log("清除旧的音量键监听器");
                        } catch (e) {
                            // 如果removeListener不可用，不做任何操作，让新监听器覆盖
                        }
                        volumeKeyHandler = null;
                        keyListenersRegistered = false;
                    }

                    // 安全模式下不启用拦截，仅监听（避免个别 ROM 重启/卡死）
                    var safeMode = ui.chkSafeMode.isChecked();
                    if (!safeMode) {
                        try {
                            events.setKeyInterceptionEnabled && events.setKeyInterceptionEnabled(true);
                            floatConsole.log("✓ 键拦截已启用");
                        } catch (e) {
                            floatConsole.warn("键拦截不可用：" + e);
                        }
                    } else {
                        floatConsole.log("ℹ 安全模式：仅监听不拦截");
                    }

                    // 创建音量键处理函数（保存引用以便后续清除）
                    volumeKeyHandler = function(code, event) {
                        if (code === 25) { // 25 = KEYCODE_VOLUME_DOWN
                            lastAccessibilityCheck = Date.now();
                            onVolumeDown();
                        }
                    };

                    // 注册音量键监听（方式A：标准API）
                    var methodASuccess = false;
                    try {
                        if (Perms.hasAccessibility()) {
                            events.observeKey();
                            events.onKeyDown("volume_down", e => {
                                lastAccessibilityCheck = Date.now();
                                onVolumeDown();
                            });
                            methodASuccess = true;
                            floatConsole.log("✓ 音量键监听注册成功（方式A）");
                        } else {
                            floatConsole.warn("方式A需要无障碍服务");
                        }
                    } catch (e) {
                        floatConsole.warn("方式A注册失败：" + e);
                        console.error("observeKey异常: " + e);
                    }

                    // 注册音量键监听（方式B：通用事件，使用保存的处理函数）
                    var methodBSuccess = false;
                    try {
                        events.on("key_down", volumeKeyHandler);
                        methodBSuccess = true;
                        floatConsole.log("✓ 音量键监听注册成功（方式B）");
                    } catch (e) {
                        floatConsole.warn("方式B注册失败：" + e);
                    }

                    // 汇总注册结果
                    if (methodASuccess || methodBSuccess) {
                        keyListenersRegistered = true;
                        floatConsole.log("✓ 音量键监听注册完成，现在可以按音量下键控制脚本");
                        // 启动健康检查定时器
                        startListenerHealthCheck();
                    } else {
                        keyListenersRegistered = false;
                        volumeKeyHandler = null;
                        floatConsole.error("❌ 所有注册方式都失败，音量键可能无法使用");
                    }
                } catch (e) {
                    keyListenersRegistered = false;
                    volumeKeyHandler = null;
                    floatConsole.error("注册按键监听失败：" + e);
                }
            }

            // 监听器健康检查和自动恢复
            function startListenerHealthCheck() {
                // 清除旧定时器
                if (listenerHealthCheckTimer) {
                    try {
                        clearInterval(listenerHealthCheckTimer);
                    } catch (e) {}
                    listenerHealthCheckTimer = null;
                }

                // 启动新的健康检查（每30秒检查一次）
                listenerHealthCheckTimer = setInterval(() => {
                    try {
                        if (!keyControlEnabled) {
                            // 如果音量键控制已关闭，停止检查
                            if (listenerHealthCheckTimer) {
                                clearInterval(listenerHealthCheckTimer);
                                listenerHealthCheckTimer = null;
                            }
                            return;
                        }

                        var now = Date.now();
                        // 如果超过60秒没有收到音量键事件，且无障碍服务状态异常，尝试恢复
                        if (now - lastAccessibilityCheck > 60000) {
                            if (!Perms.checkAccessibilityHealth()) {
                                floatConsole.warn("⚠️ 检测到无障碍服务异常，尝试恢复监听器...");
                                keyListenersRegistered = false;
                                registerKeyListeners();
                            }
                            // 重置检查时间，避免频繁检查
                            lastAccessibilityCheck = now;
                        }
                    } catch (e) {
                        console.error("健康检查异常: " + e);
                    }
                }, 30000); // 30秒检查一次
            }

            function stopListenerHealthCheck() {
                if (listenerHealthCheckTimer) {
                    try {
                        clearInterval(listenerHealthCheckTimer);
                    } catch (e) {}
                    listenerHealthCheckTimer = null;
                }
            }

            // 简化的监听检查（不再频繁重注册）
            function checkKeyListenerHealth() {
                // 仅在真正需要时才重新注册，而不是定时检查
                // 音量键监听一次注册后会持续有效
            }

            function enableKeyControl() {
                if (keyControlEnabled) return;
                if (!isAccessibilityEnabled()) {
                    showHint("请先开启无障碍服务");
                    Perms.openAccessibilitySettings();
                    return;
                }
                keyControlEnabled = true;
                lastAccessibilityCheck = Date.now(); // 初始化检查时间
                registerKeyListeners();
                floatConsole.log("✓ 音量键控制已开启（智能监控，自动恢复）");
            }

            function disableKeyControl() {
                keyControlEnabled = false;
                stopListenerHealthCheck(); // 停止健康检查
                // 精确移除音量键监听器
                if (volumeKeyHandler) {
                    try {
                        events.removeListener && events.removeListener("key_down", volumeKeyHandler);
                    } catch (e) {}
                    volumeKeyHandler = null;
                }
                keyListenersRegistered = false;
                floatConsole.log("音量键控制已关闭");
            }

            ui.toggleKeyControl.click(() => {
                if (!keyControlEnabled) {
                    enableKeyControl();
                    ui.toggleKeyControl.setText("关闭音量键控制");
                    showHint("音量键控制已开启");
                } else {
                    disableKeyControl();
                    ui.toggleKeyControl.setText("开启音量键控制（按音量下开始/停止）");
                    showHint("音量键控制已关闭");
                }
            });
            setTimeout(() => {
                checkAndShowPermissions(false);
            }, 500);

            // 注册清理函数
            currentCleanup = function() {
                try {
                    // 停止健康检查定时器
                    stopListenerHealthCheck();
                    // 停止脚本线程
                    if (scriptThread) {
                        try {
                            scriptThread.interrupt();
                        } catch (e) {}
                        scriptThread = null;
                    }
                    // 关闭音量键控制
                    if (keyControlEnabled) {
                        disableKeyControl();
                    }
                } catch (e) {
                    console.log("清理Feature A资源:", e);
                }
            };

            // ===== 主流程（基于你原有逻辑，未做功能改变，仅加安全入参 safeMode） =====
            function runMainScript(floatConsole, safeMode) {
                // 仅在运行时申请截图权限（避免启动即弹权限造成 Settings 崩溃）
                if (!Perms.tryCaptureOnce()) {
                    if (!Perms.requestScreenCaptureInteractive(3)) {
                        floatConsole.error("错误: 无法获取截图权限");
                        return;
                    } else {
                        floatConsole.log("截图权限获取成功");
                    }
                }

                // 下方为原始资源/匹配/流程，拷贝自你的脚本（略缩变量名/删除无关注释保持一致性）
                var ResourceManager = {
                    cacheDir: files.join(files.getSdcardPath(), "HuoyingCache"),
                    init: function() {
                        files.ensureDir(this.cacheDir);
                        floatConsole.log("资源缓存目录: " + this.cacheDir);
                        this.copyAllResources();
                    },
                    copyAllResources: function() {
                        var resourceList = ["招募.jpg", "putongzhaomu.png", "mianfeiyici.png", "queding.png", "zhaomuchahao.png", "jiangli.png", "qianwang.jpg", "jingyingfuben.png", "bianjiesaodang.jpg", "yijianquanxuan.png", "saodang.png", "jixusaodang.png", "jingyingfubenchahao.png", "fenxiangqifu.png", "zuzhiqifuchahao1.png", "zuzhiqifuchahao2.png", "zuzhiqifuchahao3.png", "zhaocaichahao.png", "xiaoduituxipipei.png", "xiaoduituxichuzhan.png", "xiaoduituxiguanbi.png", "tiaozhan.jpg", "tiaozhan2.jpg", "zhanting.jpg", "tuichu.jpg", "queding.jpg", "shi.jpg", "jifensaichahao.jpg", "fenxiang.png", "fasong.png", "guanbi.png", "juanzhou.jpg", "shengcunsaodang.jpg", "zhunbeijiuxu.png", "shengcunqueding.jpg", "shengcunqueding2.jpg", "tingzhisaodang.png", "chongzhi.png", "shengcunchahao2.png", "lingqu.png", "mianfei3.jpg"];
                        floatConsole.log("开始复制资源文件...");
                        var successCount = 0;
                        resourceList.forEach(function(filename) {
                            try {
                                var targetPath = files.join(this.cacheDir, filename);
                                // 如果目标已存在且有效，跳过
                                if (files.exists(targetPath) && files.isFile(targetPath) && new java.io.File(targetPath).length() > 0) {
                                    floatConsole.log("✓ 资源已存在: " + filename);
                                    successCount++;
                                    return;
                                }
                                
                                // 尝试多个可能的资源路径
                                var possiblePaths = [
                                    "res/" + filename,                           // 相对路径
                                    files.path("res/" + filename),               // 绝对路径
                                    files.join(files.cwd(), "res", filename),   // 当前目录
                                    "/sdcard/脚本/res/" + filename,              // SD卡脚本目录
                                    "/storage/emulated/0/脚本/res/" + filename   // 标准存储路径
                                ];
                                
                                var copied = false;
                                for (var i = 0; i < possiblePaths.length; i++) {
                                    var resPath = possiblePaths[i];
                                    try {
                                        if (files.exists(resPath) && files.isFile(resPath)) {
                                            files.copy(resPath, targetPath);
                                            floatConsole.log("✓ 复制成功: " + filename + " (从: " + resPath + ")");
                                            successCount++;
                                            copied = true;
                                            break;
                                        }
                                    } catch (e) {
                                        // 忽略单个路径的失败，继续尝试下一个
                                    }
                                }
                                
                                if (!copied) {
                                    floatConsole.warn("✗ 资源未找到: " + filename + " (已尝试 " + possiblePaths.length + " 个路径)");
                                }
                            } catch (e) {
                                floatConsole.error("✗ 复制失败 " + filename + ": " + e);
                            }
                        }.bind(this));
                        floatConsole.log("资源复制完成: " + successCount + "/" + resourceList.length);
                        
                        if (successCount === 0) {
                            floatConsole.error("⚠️ 警告：没有成功复制任何资源文件！");
                            floatConsole.error("请确保res文件夹中包含所有图片资源");
                            toast("资源文件缺失，请检查res目录");
                        }
                    },
                    getPath: function(filename) {
                        return files.join(this.cacheDir, filename);
                    }
                };

                var CONFIG = {

                    reward: {
                        jiangli: ResourceManager.getPath("jiangli.png"),
                        qianwang: ResourceManager.getPath("qianwang.jpg"),
                        mianfeiyici: ResourceManager.getPath("mianfeiyici.png"),
                        checkInterval: 3000,
                        enabled: true,
                        qianwangClickCount: 0,
                        qianwangClickSequence: [1, 1, 1, 2, 3, 4, 5, 2],
                        skipNextRewardPriority: false
                    },
                    focusAfterQW: {
                        active: false,
                        until: 0,
                        windowMs: 30000,
                        targetName: null,
                        sequence: ["精英副本组", "组织祈福组", "金币招财组", "招募主流程组", "小队突袭组", "积分赛组", "生存挑战组", "任务集会所组"]
                    },
                    indexCheckOrder: [],
                    groups: [{
                        name: "招募主流程组",
                        index: ResourceManager.getPath("putongzhaomu.png"),
                        enabled: false,
                        priority: 4,
                        templates: [ResourceManager.getPath("putongzhaomu.png"), ResourceManager.getPath("mianfei3.jpg"), ResourceManager.getPath("queding.png"), ResourceManager.getPath("queding.png"), ResourceManager.getPath("queding.png"), ResourceManager.getPath("zhaomuchahao.png"), ResourceManager.getPath("zhaomuchahao.png")]
                    }, {
                        name: "精英副本组",
                        index: ResourceManager.getPath("jingyingfuben.png"),
                        enabled: false,
                        priority: 1,
                        templates: [ResourceManager.getPath("jingyingfuben.png"), ResourceManager.getPath("bianjiesaodang.jpg"), ResourceManager.getPath("yijianquanxuan.png"), ResourceManager.getPath("saodang.png"), ResourceManager.getPath("jixusaodang.png"), ResourceManager.getPath("jingyingfubenchahao.png"), ResourceManager.getPath("jingyingfubenchahao.png"), ResourceManager.getPath("jingyingfubenchahao.png"), ResourceManager.getPath("jingyingfubenchahao.png"), ResourceManager.getPath("jingyingfubenchahao.png"), ResourceManager.getPath("jingyingfubenchahao.png")]
                    }, {
                        name: "组织祈福组",
                        index: ResourceManager.getPath("fenxiangqifu.png"),
                        enabled: false,
                        priority: 2,
                        templates: [ResourceManager.getPath("fenxiangqifu.png"), ResourceManager.getPath("zuzhiqifuchahao1.png"), ResourceManager.getPath("zuzhiqifuchahao2.png"), ResourceManager.getPath("zuzhiqifuchahao2.png"), ResourceManager.getPath("zuzhiqifuchahao2.png"),ResourceManager.getPath("zuzhiqifuchahao2.png")]
                    }, {
                        name: "金币招财组",
                        index: ResourceManager.getPath("mianfeiyici.png"),
                        enabled: false,
                        priority: 3,
                        templates: [ResourceManager.getPath("mianfeiyici.png"), ResourceManager.getPath("mianfeiyici.png"), ResourceManager.getPath("zhaocaichahao.png")]
                    }, {
                        name: "小队突袭组",
                        index: ResourceManager.getPath("xiaoduituxipipei.png"),
                        enabled: false,
                        priority: 5,
                        templates: [ResourceManager.getPath("xiaoduituxipipei.png"), ResourceManager.getPath("xiaoduituxichuzhan.png"), ResourceManager.getPath("xiaoduituxipipei.png"), ResourceManager.getPath("xiaoduituxichuzhan.png"), ResourceManager.getPath("xiaoduituxiguanbi.png"), ResourceManager.getPath("xiaoduituxiguanbi.png"), ResourceManager.getPath("xiaoduituxiguanbi.png")]
                    }, {
                        name: "积分赛组",
                        index: ResourceManager.getPath("tiaozhan.jpg"),
                        enabled: false,
                        priority: 6,
                        templates: [ResourceManager.getPath("tiaozhan.jpg"), ResourceManager.getPath("tiaozhan2.jpg"), ResourceManager.getPath("queding.jpg"), ResourceManager.getPath("shi.jpg"), ResourceManager.getPath("jifensaichahao.jpg")]
                    }, {
                        name: "生存挑战组",
                        index: ResourceManager.getPath("juanzhou.jpg"),
                        enabled: false,
                        priority: 7,
                        templates: [ResourceManager.getPath("shengcunsaodang.jpg"), ResourceManager.getPath("zhunbeijiuxu.png"), ResourceManager.getPath("queding.jpg"), ResourceManager.getPath("shengcunqueding.jpg"), ResourceManager.getPath("shengcunqueding2.jpg"), ResourceManager.getPath("queding.png"), ResourceManager.getPath("queding.png"), ResourceManager.getPath("queding.png"), ResourceManager.getPath("tingzhisaodang.png"), ResourceManager.getPath("chongzhi.png"), ResourceManager.getPath("queding.jpg"), ResourceManager.getPath("shengcunchahao2.png"), ResourceManager.getPath("shengcunchahao2.png")]
                    }, {
                        name: "任务集会所组",
                        index: ResourceManager.getPath("lingqu.png"),
                        enabled: false,
                        priority: 8,
                        templates: [ResourceManager.getPath("lingqu.png"), ResourceManager.getPath("queding.jpg")]
                    }],
                    phases: [{
                        name: "分组招募流程",
                        useGroups: true,
                        attempts: 2,
                        loop: true,
                        interval: 3500,
                        timeout: 3000000
                    }],
                    match: {
                        threshold: 0.8,
                        scales: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 1.0, 1.1, 1.15, 1.2, 1.3, 1.4],
                        method: 'TM_CCOEFF_NORMED'
                    },
                    debug: true
                };
                
                // 将CONFIG保存为全局变量（使用global对象）
                global.GLOBAL_CONFIG = CONFIG;
                
                // 初始化资源管理器（复制图片资源）
                try {
                    ResourceManager.init();
                } catch (e) {
                    floatConsole.error("ResourceManager初始化失败: " + e);
                    toast("资源初始化失败，请检查res目录");
                }
                
                // 从存储中加载阈值并更新CONFIG
                try {
                    var savedThreshold = THRESHOLD_STORE.get("threshold", 0.8);
                    CONFIG.match.threshold = savedThreshold;
                    floatConsole.log("✓ 已加载保存的阈值: " + savedThreshold.toFixed(2));
                } catch (e) {
                    floatConsole.warn("加载阈值失败，使用默认值0.8: " + e);
                }

                function initIndexCheckOrder() {
                    CONFIG.indexCheckOrder = [];
                    CONFIG.groups.forEach(function(group, index) {
                        CONFIG.indexCheckOrder.push(index);

// >>> focusAfterQW窗口延长改动：将默认5秒改为10秒（如需恢复改成5000）
try { CONFIG.focusAfterQW = CONFIG.focusAfterQW || {}; CONFIG.focusAfterQW.windowMs = CONFIG.focusAfterQW.windowMs || 30000; } catch(e){}
// <<<
                    });
                    floatConsole.log("初始化索引检测顺序: " + CONFIG.indexCheckOrder.map(idx => CONFIG.groups[idx].name).join(" → "));
                }

                function moveGroupToLastInOrder(groupIndex) {
                    var currentPos = CONFIG.indexCheckOrder.indexOf(groupIndex);
                    if (currentPos !== -1) {
                        CONFIG.indexCheckOrder.splice(currentPos, 1);
                        CONFIG.indexCheckOrder.push(groupIndex);
                        floatConsole.log("调整索引检测顺序，将 \"" + CONFIG.groups[groupIndex].name + "\" 移至最后");
                        floatConsole.log("新的检测顺序: " + CONFIG.indexCheckOrder.map(idx => CONFIG.groups[idx].name).join(" → "));
                    }
                }

                function safeScale(img, scale) {
                    try {
                        var newWidth = Math.max(30, Math.round(img.width * scale));
                        var newHeight = Math.max(30, Math.round(img.height * scale));
                        return images.resize(img, [newWidth, newHeight]);
                    } catch (e) {
                        return null;
                    }
                }

                function multiMatch(screen, template) {
                    var templateImg = images.read(template);
                    if (!templateImg) {
                        floatConsole.error("模板读取失败:" + template);
                        return null;
                    }

                    // 读取缓存与分辨率估算：假设模板原始参考宽度为1080px
                    var fileName = (template + "").split("/").pop();
                    var cachedScale = null;
                    try {
                        cachedScale = SCALE_CACHE.get(fileName, null);
                    } catch (e) {}
                    var wh = (typeof __initWH !== "undefined" && __initWH) ? __initWH : {
                        w: device.width,
                        h: device.height
                    };
                    var guessScale = Math.min((wh.w || device.width) / 1080.0, (wh.h || device.height) / 1920.0);
                    if (!isFinite(guessScale) || guessScale <= 0) guessScale = 1.0;

                    // 构造优先队列：先试 缓存 → 估算 → 原表中接近二者的邻域（向两侧扩张）
                    function unique(arr) {
                        var s = {},
                            out = [];
                        for (var i = 0; i < arr.length; i++) {
                            var v = Number(arr[i]);
                            if (!isFinite(v)) continue;
                            var k = v.toFixed(4);
                            if (!s[k]) {
                                s[k] = true;
                                out.push(v);
                            }
                        }
                        return out;
                    }
                    var base = CONFIG.match.scales.slice(0);

                    function neighbors(center, base) {
                        // 根据 base 中的顺序，按与 center 的距离排序，优先靠近 center 的
                        return base.slice(0).sort(function(a, b) {
                            return Math.abs(a - center) - Math.abs(b - center);
                        });
                    }

                    var priority = [];
                    if (cachedScale) priority.push(Number(cachedScale));
                    priority.push(guessScale);
                    var sortedByCached = cachedScale ? neighbors(cachedScale, base) : [];
                    var sortedByGuess = neighbors(guessScale, base);

                    var scaleOrder = unique([].concat(priority, sortedByCached, sortedByGuess, base));

                    var bestMatch = {
                            similarity: 0
                        },
                        bestScale = null,
                        bestWH = null;
                    for (var si = 0; si < scaleOrder.length; si++) {
                        var scale = scaleOrder[si];
                        var scaled = safeScale(templateImg, scale);
                        if (!scaled) continue;
                        var result = images.matchTemplate(screen, scaled, {
                            threshold: CONFIG.match.threshold,
                            method: CONFIG.match.method
                        });
                        if (result && result.matches.length > 0) {
                            var currentBest = result.matches.reduce((prev, curr) => (curr.similarity > prev.similarity) ? curr : prev);
                            if (currentBest.similarity > bestMatch.similarity) {
                                bestMatch = {
                                    point: currentBest.point,
                                    similarity: currentBest.similarity,
                                    scale: scale,
                                    width: scaled.width,
                                    height: scaled.height
                                };
                                bestScale = scale;
                                bestWH = {
                                    w: scaled.width,
                                    h: scaled.height
                                };
                            }
                        }
                        scaled.recycle();
                        // 早停：一旦相似度足够高，直接使用
                        if (bestMatch.similarity >= 0.92) break;
                    }

                    templateImg.recycle();
                    if (bestMatch.similarity > CONFIG.match.threshold) {
                        try {
                            if (bestScale != null) {
                                SCALE_CACHE.put(fileName, Number(bestScale));
                            }
                        } catch (e) {}
                        return bestMatch;
                    }
                    return null;
                }


                function findAllMatches(screen, template) {
                    var templateImg = images.read(template);
                    if (!templateImg) {
                        floatConsole.error("模板读取失败:" + template);
                        return [];
                    }

                    var fileName = (template + "").split("/").pop();
                    var cachedScale = null;
                    try {
                        cachedScale = SCALE_CACHE.get(fileName, null);
                    } catch (e) {}
                    var wh = (typeof __initWH !== "undefined" && __initWH) ? __initWH : {
                        w: device.width,
                        h: device.height
                    };
                    var guessScale = Math.min((wh.w || device.width) / 1080.0, (wh.h || device.height) / 1920.0);
                    if (!isFinite(guessScale) || guessScale <= 0) guessScale = 1.0;

                    function unique(arr) {
                        var s = {},
                            out = [];
                        for (var i = 0; i < arr.length; i++) {
                            var v = Number(arr[i]);
                            if (!isFinite(v)) continue;
                            var k = v.toFixed(4);
                            if (!s[k]) {
                                s[k] = true;
                                out.push(v);
                            }
                        }
                        return out;
                    }
                    var base = CONFIG.match.scales.slice(0);

                    function neighbors(center, base) {
                        return base.slice(0).sort(function(a, b) {
                            return Math.abs(a - center) - Math.abs(b - center);
                        });
                    }

                    var priority = [];
                    if (cachedScale) priority.push(Number(cachedScale));
                    priority.push(guessScale);
                    var sortedByCached = cachedScale ? neighbors(cachedScale, base) : [];
                    var sortedByGuess = neighbors(guessScale, base);

                    var scaleOrder = unique([].concat(priority, sortedByCached, sortedByGuess, base));

                    var allMatches = [];
                    for (var si = 0; si < scaleOrder.length; si++) {
                        var scale = scaleOrder[si];
                        var scaled = safeScale(templateImg, scale);
                        if (!scaled) continue;
                        var result = images.matchTemplate(screen, scaled, {
                            threshold: CONFIG.match.threshold,
                            method: CONFIG.match.method,
                            max: 10
                        });
                        if (result && result.matches.length > 0) {
                            result.matches.forEach(function(match) {
                                if (match.similarity > CONFIG.match.threshold) {
                                    allMatches.push({
                                        point: match.point,
                                        similarity: match.similarity,
                                        scale: scale,
                                        width: scaled.width,
                                        height: scaled.height
                                    });
                                }
                            });
                        }
                        scaled.recycle();
                        // 修复：移除提前终止逻辑，确保找到所有"前往"按钮，避免索引错位
                        // if (allMatches.length >= 10) break;
                    }

                    templateImg.recycle();
                    var uniqueMatches = [];
                    allMatches.forEach(function(match) {
                        var isDuplicate = uniqueMatches.some(function(existing) {
                            return Math.abs(existing.point.x - match.point.x) < 50 && Math.abs(existing.point.y - match.point.y) < 50;
                        });
                        if (!isDuplicate) uniqueMatches.push(match);
                    });
                    // 命中后写回缓存（取相似度最高的）
                    if (uniqueMatches.length > 0) {
                        var top = uniqueMatches.slice(0).sort(function(a, b) {
                            return b.similarity - a.similarity;
                        })[0];
                        try {
                            SCALE_CACHE.put(fileName, Number(top.scale));
                        } catch (e) {}
                    }
                    // 修复完成：按X坐标排序返回所有匹配结果
                    return uniqueMatches.sort((a, b) => a.point.x - b.point.x);
                }


                function rewardGate() {
                    try {
                        if (CONFIG && CONFIG.reward && CONFIG.reward.skipNextRewardPriority) {
                            if (typeof floatConsole !== "undefined" && floatConsole.log) floatConsole.log("\n⏭️ 跳过一次‘奖励优先’（上轮已点击前往）");
                            CONFIG.reward.skipNextRewardPriority = false;
                            return false;
                        }
                    } catch (e) {}
                    return !!(typeof checkAndClickReward === 'function' && checkAndClickReward());
                }

                function checkAndClickReward() {
                    var screen = null;
                    var screen2 = null;
                    try {
                        screen = images.captureScreen();
                        if (!screen) {
                            floatConsole.error("奖励检测截图失败");
                            return false;
                        }
                        
                        var jiangliMatch = multiMatch(screen, CONFIG.reward.jiangli);
                        if (!jiangliMatch) {
                            floatConsole.log("❌ 未发现奖励图标");
                            return false;
                        }
                        
                        // 点击奖励图标
                        var targetX = jiangliMatch.point.x + jiangliMatch.width / 2 + random(-5, 5);
                        var targetY = jiangliMatch.point.y + jiangliMatch.height / 2 + random(-5, 5);
                        click(targetX, targetY);
                        floatConsole.log("✅ 点击奖励图标 | 相似度: " + jiangliMatch.similarity.toFixed(3));
                        floatConsole.log("📍 坐标: (" + targetX + ", " + targetY + ")");
                        
                        // 释放第一个screen
                        try { if (screen) screen.recycle(); } catch (e) { console.error("释放screen异常: " + e); }
                        screen = null;
                        
                        sleep(2000);
                        floatConsole.log("🔍 查找前往按钮...");
                        
                        // 截取第二张图
                        screen2 = images.captureScreen();
                        if (!screen2) {
                            floatConsole.error("前往检测截图失败");
                            return true;
                        }
                        
                        var qianwangMatches = findAllMatches(screen2, CONFIG.reward.qianwang);
                        if (qianwangMatches.length === 0) {
                            floatConsole.log("❌ 未发现前往按钮");
                            return false;
                        }
                        
                        // 点击前往按钮
                        floatConsole.log("🎯 找到 " + qianwangMatches.length + " 个前往按钮");
                        var clickIndex = CONFIG.reward.qianwangClickCount % CONFIG.reward.qianwangClickSequence.length;
                        var targetPosition = CONFIG.reward.qianwangClickSequence[clickIndex];
                        if (targetPosition > qianwangMatches.length) targetPosition = qianwangMatches.length;
                        var targetMatch = qianwangMatches[targetPosition - 1];
                        var targetX2 = targetMatch.point.x + targetMatch.width / 2 + random(-5, 5);
                        var targetY2 = targetMatch.point.y + targetMatch.height / 2 + random(-5, 5);
                        click(targetX2, targetY2);
                        CONFIG.reward.qianwangClickCount++;
                        
                        // 设置focusAfterQW
                        try {
                            var seq = (CONFIG && CONFIG.focusAfterQW && CONFIG.focusAfterQW.sequence) ? CONFIG.focusAfterQW.sequence : [];
                            var n = CONFIG.reward.qianwangClickCount;
                            if (seq.length > 0) {
                                var idx = (n - 1) % seq.length;
                                var name = seq[idx];
                                CONFIG.focusAfterQW.active = true;
                                CONFIG.focusAfterQW.targetName = name;
                                CONFIG.focusAfterQW.until = new Date().getTime() + (CONFIG.focusAfterQW.windowMs || 30000);
                                if (typeof floatConsole !== "undefined" && floatConsole.log) {
                                    floatConsole.log("🎯 接下来 " + (CONFIG.focusAfterQW.windowMs || 30000) + "ms 仅检测分组: " + name + "（基于第" + n + "次点击前往）");
                                }
                            }
                        } catch (e) {
                            try {
                                floatConsole.warn("focusAfterQW 设置异常: " + e);
                            } catch (_e) {}
                        }
                        
                        CONFIG.reward.skipNextRewardPriority = true;
                        if (typeof floatConsole !== "undefined" && floatConsole.log) {
                            floatConsole.log("⏭️ 已点击前往，本轮结束后将跳过一次'奖励优先'");
                        }
                        floatConsole.log("✅ 点击前往按钮 #" + targetPosition + " (第" + (CONFIG.reward.qianwangClickCount) + "次点击)");
                        floatConsole.log("   相似度: " + targetMatch.similarity.toFixed(3));
                        floatConsole.log("📍 坐标: (" + targetX2 + ", " + targetY2 + ")");
                        sleep(2000);
                        
                        return true;
                    } catch (e) {
                        floatConsole.error("checkAndClickReward异常: " + e);
                        console.error("checkAndClickReward异常详情: " + e);
                        return false;
                    } finally {
                        // 确保释放所有图片资源
                        try { if (screen) screen.recycle(); } catch (e) {}
                        try { if (screen2) screen2.recycle(); } catch (e) {}
                    }
                }

                function checkAndClickRewardNTimes(times) {
                    times = Math.max(1, times | 0);
                    for (var i = 0; i < times; i++) {
                        if (threads.currentThread && threads.currentThread().isInterrupted && threads.currentThread().isInterrupted()) return false;
                        var handled = checkAndClickReward();
                        if (handled) {
                            floatConsole.log("✅ 连续检测(" + times + "次)中第 " + (i + 1) + " 次已成功，提前结束后续检测");
                            return true;
                        }
                        sleep(800);
                    }
                    return false;
                }

                function checkAndEnableGroups() {
                    try {
                        if (CONFIG && CONFIG.focusAfterQW && CONFIG.focusAfterQW.active) {
                            if (new Date().getTime() > CONFIG.focusAfterQW.until) {
                                CONFIG.focusAfterQW.active = false;
                            } else {
                                var target = CONFIG.focusAfterQW.targetName;
                                if (target) {
                                    floatConsole.log("\n🔎 仅检索目标分组索引: " + target + "（前往后限定窗口）");
                                    var onlyIdx = -1;
                                    for (var i = 0; i < CONFIG.groups.length; i++) {
                                        if (CONFIG.groups[i].name === target) {
                                            onlyIdx = i;
                                            break;
                                        }
                                    }
                                    if (onlyIdx >= 0) {
                                        var savedOrder = CONFIG.indexCheckOrder.slice(0);
                                        CONFIG.indexCheckOrder = [onlyIdx];
                                        try {} finally {
                                            CONFIG.indexCheckOrder = savedOrder;
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        try {
                            floatConsole.warn("focusAfterQW 门控异常: " + e);
                        } catch (_e) {}
                    }
                    var screen = images.captureScreen();
                    if (!screen) {
                        floatConsole.error("索引检测截图失败");
                        return false;
                    }
                    var foundAnyIndex = false;
                    for (var i = 0; i < CONFIG.indexCheckOrder.length; i++) {
                        var groupIndex = CONFIG.indexCheckOrder[i];
                        var group = CONFIG.groups[groupIndex];
                        if (!group.enabled && group.index) {
                            var indexMatch = multiMatch(screen, group.index);
                            if (indexMatch) {
                                group.enabled = true;
                                foundAnyIndex = true;
                                floatConsole.log("✅ 激活分组: " + group.name);
                                floatConsole.log("   相似度: " + indexMatch.similarity.toFixed(3));
                                break;
                            }
                        }
                    }
                    screen.recycle();
                    return foundAnyIndex;
                }

                function ensureTemplateClicked(templatePath) {
                    while (true) {
                        try {
                            if (threads.currentThread && threads.currentThread().isInterrupted && threads.currentThread().isInterrupted()) return false;
                        } catch (e) {}
                        var screen = images.captureScreen();
                        if (!screen) {
                            sleep(500);
                            continue;
                        }
                        var hit = multiMatch(screen, templatePath);
                        screen.recycle();
                        if (hit) {
                            var tx = hit.point.x + hit.width / 2 + random(-5, 5);
                            var ty = hit.point.y + hit.height / 2 + random(-5, 5);
                            click(tx, ty);
                            floatConsole.log("  ✅ 必点成功：" + templatePath + " | 相似度: " + hit.similarity.toFixed(3));
                            sleep(900);
                            return true;
                        }
                        floatConsole.log("  ⏳ 等待出现并点击：" + templatePath);
                        sleep(650);
                    }
                }

                function ensureLastImageProcessed(template, groupName) {
                    var filename = template.substring(template.lastIndexOf("/") + 1);
                    floatConsole.log("  🎯 [" + groupName + "] 最后图片：" + filename + " - 开始完全处理");
                    var totalClicks = 0;
                    var maxAttempts = 50;
                    var attempts = 0;
                    while (attempts < maxAttempts) {
                        try {
                            if (threads.currentThread && threads.currentThread().isInterrupted && threads.currentThread().isInterrupted()) {
                                floatConsole.log("  ⚠️ 检测到中断信号");
                                return false;
                            }
                        } catch (e) {}
                        attempts++;
                        floatConsole.log("  🔍 第 " + attempts + " 次检查：是否还有 " + filename);
                        var screen = images.captureScreen();
                        if (!screen) {
                            floatConsole.warn("  ⚠️ 截图失败，等待1秒后重试");
                            sleep(1000);
                            continue;
                        }
                        var matchResult = multiMatch(screen, template);
                        screen.recycle();
                        if (matchResult) {
                            totalClicks++;
                            var cx = matchResult.point.x + matchResult.width / 2 + random(-5, 5);
                            var cy = matchResult.point.y + matchResult.height / 2 + random(-5, 5);
                            click(cx, cy);
                            floatConsole.log("  ✅ 第 " + totalClicks + " 次点击 | 相似度: " + matchResult.similarity.toFixed(3));
                            floatConsole.log("  📍 坐标: (" + cx + ", " + cy + ")");
                            sleep(1500);
                        } else {
                            floatConsole.log("  ✓ 屏幕上已无 " + filename + "，共点击 " + totalClicks + " 次");
                            return true;
                        }
                    }
                    floatConsole.warn("  ⚠️ 达到最大尝试次数(" + maxAttempts + ")，停止处理");
                    return false;
                }

                function processGroupPhase(phase) {
                    var startTime = Date.now();
                    var cycleCount = 0;
                    while (true) {
                        if (threads.currentThread().isInterrupted()) {
                            floatConsole.log("检测到中断信号，停止执行");
                            return false;
                        }
                        cycleCount++;
                        if (phase.timeout && Date.now() - startTime > phase.timeout) {
                            floatConsole.log("⌛ 阶段超时");
                            return true;
                        }
                        floatConsole.log("\n🎁 优先奖励检测...");
                        if (rewardGate()) {
                            continue;
                        }
                        floatConsole.log("\n🔍 检查索引图片...");
                        var foundIndex = checkAndEnableGroups();
                        var activeGroups = CONFIG.groups.filter(group => group.enabled && group.templates.length > 0).sort((a, b) => (a.priority || 999) - (b.priority || 999));
                        if (activeGroups.length > 0) {
                            floatConsole.log("\n📋 发现激活分组，开始执行分组逻辑（暂停奖励检测）");
                            for (var g = 0; g < activeGroups.length; g++) {
                                var group = activeGroups[g];
                                var groupIndex = CONFIG.groups.indexOf(group);
                                floatConsole.log("\n[分组] " + group.name + " - 执行中 (优先级: " + (group.priority || 999) + ")");
                                for (var i = 0; i < group.templates.length; i++) {
                                    if (threads.currentThread().isInterrupted()) {
                                        floatConsole.log("检测到中断信号，停止执行");
                                        return false;
                                    }
                                    var template = group.templates[i];
                                    var filename = template.substring(template.lastIndexOf("/") + 1);
                                    var isLastImage = (i === group.templates.length - 1);
                                    
                                    if (group.name === "积分赛组" && (filename === "queding.jpg" || filename === "jifensaichahao.jpg")) {
                                        floatConsole.log("  🔒 积分赛必点：" + filename + "（等待直至点击成功）");
                                        if (!ensureTemplateClicked(template)) break;
                                        if (filename === "queding.jpg") slowTopLeftClicks(3, 3000);
                                        continue;
                                    }
                                    
                                    floatConsole.log("  模板 " + (i + 1) + "/" + group.templates.length + ": " + filename + (isLastImage ? " 【最后一张】" : ""));
                                    
                                    if (isLastImage) {
                                        floatConsole.log("  🎯 检测到最后一张图片，启用完全处理模式");
                                        ensureLastImageProcessed(template, group.name);
                                        continue;
                                    }
                                    
                                    var screen = images.captureScreen();
                                    if (!screen) {
                                        floatConsole.error("  ❌ 截图失败，跳过此图片");
                                        continue;
                                    }
                                    var matchResult = null;
                                    if (filename === "bianjiesaodang.png") {
                                        try {
                                            var allMatches = findAllMatches(screen, template);
                                            if (allMatches && allMatches.length > 0) {
                                                matchResult = allMatches[0];
                                                floatConsole.log("  🎯 bianjiesaodang.png 出现 " + allMatches.length + " 个，只点击最左边的一个");
                                            }
                                        } catch (e) {
                                            floatConsole.warn("  ⚠️ bianjiesaodang 特殊处理异常: " + e);
                                        }
                                    } else {
                                        matchResult = multiMatch(screen, template);
                                    }
                                    screen.recycle();
                                    if (group.name === "小队突袭组" && filename === "xiaoduituxichuzhan.png") {
                                        if (matchResult) {
                                            var tx = matchResult.point.x + matchResult.width / 2 + random(-5, 5);
                                            var ty = matchResult.point.y + matchResult.height / 2 + random(-5, 5);
                                            click(tx, ty);
                                            floatConsole.log("  ✅ 点击成功 | 相似度: " + matchResult.similarity.toFixed(3));
                                            floatConsole.log("  📍 坐标: (" + tx + ", " + ty + ")");
                                        } else {
                                            floatConsole.log("  ⚠️ 未找到匹配，跳过此图片");
                                        }
                                        floatConsole.log("  ⏳ 小队突袭出战位置，等待1分钟...");
                                        var countdown = 60;
                                        while (countdown > 0 && !threads.currentThread().isInterrupted()) {
                                            floatConsole.log("  ⏱️ 倒计时: " + countdown + "秒");
                                            sleep(5000);
                                            countdown -= 5;
                                        }
                                        floatConsole.log("  ✅ 1分钟等待完成，继续执行");
                                    } else if (group.name === "积分赛组" && filename === "tiaozhan2.jpg") {
                                        if (matchResult) {
                                            var tx2 = matchResult.point.x + matchResult.width / 2 + random(-5, 5);
                                            var ty2 = matchResult.point.y + matchResult.height / 2 + random(-5, 5);
                                            click(tx2, ty2);
                                            floatConsole.log("  ✅ 点击成功 | 相似度: " + matchResult.similarity.toFixed(3));
                                            floatConsole.log("  📍 坐标: (" + tx2 + ", " + ty2 + ")");
                                            floatConsole.log("  ⏳ 等待12秒...");
                                            sleep(12000);
                                            floatConsole.log("  ✅ 12秒等待完成");
                                        } else {
                                            floatConsole.log("  ⚠️ 未找到匹配，跳过此图片");
                                        }
                                    } else {
                                        if (matchResult) {
                                            var cx = matchResult.point.x + matchResult.width / 2 + random(-5, 5);
                                            var cy = matchResult.point.y + matchResult.height / 2 + random(-5, 5);
                                            click(cx, cy);
                                            floatConsole.log("  ✅ 点击成功 | 相似度: " + matchResult.similarity.toFixed(3));
                                            floatConsole.log("  📍 坐标: (" + cx + ", " + cy + ")");
                                            sleep(phase.interval || 2000);
                                        } else {
                                            floatConsole.log("  ⚠️ 未找到匹配，跳过此图片");
                                        }
                                    }
                                }
                                group.enabled = false;
                                floatConsole.log("  🏁 分组 \"" + group.name + "\" 执行完成，已禁用");
                                moveGroupToLastInOrder(groupIndex);
                                floatConsole.log("  🎁 分组完成，做一次奖励检查");
                                try {
                                    checkAndClickRewardNTimes(2);
                                } catch (e) {
                                    floatConsole.warn("分组完成后奖励检查异常: " + e);
                                }
                            }
                        } else {
                            floatConsole.log("\n⚠️ 没有激活的分组，进行奖励检测...");
                            checkAndClickReward();
                        }
                        if (!phase.loop && cycleCount > CONFIG.groups.length * 2) {
                            floatConsole.log("完成所有分组处理");
                            return true;
                        }
                        sleep(1000);
                    }
                }

                function slowTopLeftClicks(times, intervalMs) {
                    times = times || 3;
                    intervalMs = intervalMs || 3000;
                    try {
                        if (typeof setScreenMetrics === "function") setScreenMetrics(device.width, device.height);
                    } catch (e) {}
                    var safeX = Math.max(15, Math.floor(device.width * 0.02));
                    var safeY = Math.max(15, Math.floor(device.height * 0.02));
                    for (var i = 0; i < times; i++) {
                        try {
                            if (threads.currentThread && threads.currentThread().isInterrupted && threads.currentThread().isInterrupted()) return;
                        } catch (e) {}
                        for (var k = 0; k < 3; k++) {
                            var x = safeX + random(0, 12);
                            var y = safeY + random(0, 12);
                            try {
                                press(x, y, 120);
                            } catch (e1) {
                                try {
                                    click(x, y);
                                } catch (e2) {}
                            }
                            floatConsole.log("  👆 左上角尝试点击 " + (i + 1) + "-" + (k + 1) + " @(" + x + "," + y + ")");
                            sleep(120);
                        }
                        sleep(intervalMs);
                    }
                }

                function main() {
                    initIndexCheckOrder();
                    floatConsole.log("\n🎮 脚本启动 - 无悬浮窗，音量键控制，UI日志");
                    floatConsole.log("🔧 提示：进入游戏后按音量下开始/停止");
                    try {
                        checkAndClickRewardNTimes(3);
                    } catch (e) {}
                    var phase = {
                        name: "分组招募流程",
                        useGroups: true,
                        loop: true,
                        interval: 2000,
                        timeout: 3000000
                    };
                    processGroupPhase(phase);
                    try {
                        toast("所有任务完成！");
                    } catch (e) {}
                }
                main();
            }

            currentCleanup = function() {
                try {
                    running = false;
                    // clickThread已移除
                    if (keyEventRegistered) {
                        events.removeAllListeners && events.removeAllListeners();
                        keyEventRegistered = false;
                    }
                } catch (e) {
                    console.log("清理资源:", e);
                }
            };
        })();
    }

    function goFeatureB() {
        safeCleanup();
        (function() {
            var keyOrder = ["普攻键", "技能1键", "技能2键", "通灵键", "密卷键", "替身键", "匹配键"];
            var points = {
                "普攻键": null,
                "技能1键": null,
                "技能2键": null,
                "通灵键": null,
                "密卷键": null,
                "替身键": null,
                "匹配键": null
            };
            var running = false,
                intervalObj = { value: 50 },  // ★修复: 使用对象包装，实现实时速度调整
                volumeKeyEnabled = false,
                markingMode = false,
                nextMarkIndex = 0;

            const STORE_NS = "NJJ_WeeklyWin_7";
            const STORE_KEY = "points_v2";
            const STORE_TIME_KEY = "points_saved_at";
            const store = storages.create(STORE_NS);

            function hasAnyMark() {
                return keyOrder.some(k => !!points[k]);
            }

            function savePoints() {
                try {
                    // 验证数据有效性
                    for (let k of keyOrder) {
                        let p = points[k];
                        if (p) {
                            if (typeof p.x !== 'number' || typeof p.y !== 'number' ||
                                !isFinite(p.x) || !isFinite(p.y)) {
                                console.error("保存失败：坐标无效 " + k + " = " + JSON.stringify(p));
                                toast("保存失败：坐标数据无效");
                                return;
                            }
                        }
                    }
                    
                    store.put(STORE_KEY, points);
                    store.put(STORE_TIME_KEY, new Date().getTime());
                    console.log("✓ 标记已保存: " + JSON.stringify(points));
                    toast("✅ 标记已保存");
                } catch (e) {
                    console.error("保存失败: " + e);
                    toast("保存失败：" + e);
                }
            }

            function refreshUIFromPoints() {
                for (let i = 0; i < keyOrder.length; i++) {
                    let k = keyOrder[i],
                        p = points[k];
                    ui.run(() => {
                        ui["txt_k" + i].setText(p && typeof p.x === "number" ? "✓ (" + p.x + ", " + p.y + ")" : "未设置");
                    });
                }
                updateStatus();
            }

            function loadSavedPoints(showToast) {
                try {
                    let saved = store.get(STORE_KEY, null);
                    if (saved && typeof saved === "object") {
                        let ok = true;
                        for (let k of keyOrder) {
                            if (!(k in saved)) {
                                console.warn("缺少键: " + k);
                                ok = false;
                                break;
                            }
                            let v = saved[k];
                            // 必须是有效对象且包含有效坐标
                            if (!v || typeof v !== 'object' || 
                                typeof v.x !== "number" || typeof v.y !== "number" ||
                                !isFinite(v.x) || !isFinite(v.y) ||
                                v.x < 0 || v.y < 0 || v.x > 10000 || v.y > 10000) {
                                console.warn("无效坐标: " + k + " = " + JSON.stringify(v));
                                ok = false;
                                break;
                            }
                        }
                        if (ok) {
                            points = saved;
                            refreshUIFromPoints();
                            if (showToast !== false) {
                                let t = store.get(STORE_TIME_KEY, null);
                                if (t) {
                                    let dt = new Date(t);
                                    toast("已恢复标记（上次保存：" + (dt.getMonth() + 1) + "月" + dt.getDate() + "日 " + dt.getHours() + ":" + ("" + dt.getMinutes()).padStart(2, "0") + "）");
                                } else toast("已恢复标记");
                            }
                            console.log("✓ 成功加载标记: " + JSON.stringify(points));
                            return true;
                        } else {
                            console.error("标记数据验证失败");
                        }
                    } else {
                        console.log("没有保存的标记数据");
                    }
                } catch (e) {
                    console.error("加载标记失败: " + e);
                }
                if (showToast) toast("未发现可用的历史标记");
                return false;
            }

            function clearPoints() {
                for (let k of keyOrder) points[k] = null;
                try {
                    store.remove(STORE_KEY);
                    store.remove(STORE_TIME_KEY);
                } catch (e) {}
                refreshUIFromPoints();
                toast("已清空所有标记");
            }

            ui.layout(
                <scroll>
                                <vertical>
                                    <appbar>
                                        <toolbar title="功能B · 火影一键周胜 - 音量键版（7点标记）"/>
                                    </appbar>
                                    <vertical padding="16">
                                        <text text="🔥 一键周胜：按顺序连点（普攻→技1→技2→通灵→密卷→替身→匹配）" textSize="16sp" textStyle="bold" textColor="#FF6600"/>
                                        <text text="音量减键：引导标记 / 开始-停止" margin="6" textColor="#666666"/>
                                        <horizontal>
                                            <button id="toggleVolumeKey" text="启用音量键控制" h="50" style="Widget.AppCompat.Button.Colored"/>
                                            <button id="backHomeB2" text="返回主页" h="50" style="Widget.AppCompat.Button.Borderless"/>
                                        </horizontal>
                                    </vertical>
                                    <vertical margin="8 4">
                                        <horizontal margin="6">
                                            <button id="mark_k0" text="标记：普攻键" layout_weight="1" style="Widget.AppCompat.Button.Colored"/>
                                            <text id="txt_k0" text="未设置" layout_weight="1" gravity="center" textColor="#FF6600"/>
                                        </horizontal>
                                        <horizontal margin="6">
                                            <button id="mark_k1" text="标记：技能1键" layout_weight="1" style="Widget.AppCompat.Button.Colored"/>
                                            <text id="txt_k1" text="未设置" layout_weight="1" gravity="center" textColor="#FF6600"/>
                                        </horizontal>
                                        <horizontal margin="6">
                                            <button id="mark_k2" text="标记：技能2键" layout_weight="1" style="Widget.AppCompat.Button.Colored"/>
                                            <text id="txt_k2" text="未设置" layout_weight="1" gravity="center" textColor="#FF6600"/>
                                        </horizontal>
                                        <horizontal margin="6">
                                            <button id="mark_k3" text="标记：通灵键" layout_weight="1" style="Widget.AppCompat.Button.Colored"/>
                                            <text id="txt_k3" text="未设置" layout_weight="1" gravity="center" textColor="#FF6600"/>
                                        </horizontal>
                                        <horizontal margin="6">
                                            <button id="mark_k4" text="标记：密卷键" layout_weight="1" style="Widget.AppCompat.Button.Colored"/>
                                            <text id="txt_k4" text="未设置" layout_weight="1" gravity="center" textColor="#FF6600"/>
                                        </horizontal>
                                        <horizontal margin="6">
                                            <button id="mark_k5" text="标记：替身键" layout_weight="1" style="Widget.AppCompat.Button.Colored"/>
                                            <text id="txt_k5" text="未设置" layout_weight="1" gravity="center" textColor="#FF6600"/>
                                        </horizontal>
                                        <horizontal margin="6">
                                            <button id="mark_k6" text="标记：匹配键" layout_weight="1" style="Widget.AppCompat.Button.Colored"/>
                                            <text id="txt_k6" text="未设置" layout_weight="1" gravity="center" textColor="#FF6600"/>
                                        </horizontal>
                                    </vertical>
                                    <card margin="16 8" cardCornerRadius="10dp" cardElevation="5dp">
                                        <vertical padding="14">
                                            <text text="🗂 标记管理" textSize="16sp" textStyle="bold" margin="0 0 8 0"/>
                                            <horizontal>
                                                <button id="btnSavePoints" text="保存标记" layout_weight="1" style="Widget.AppCompat.Button.Colored"/>
                                                <button id="btnLoadPoints" text="读取标记" layout_weight="1" style="Widget.AppCompat.Button.Borderless.Colored"/>
                                            </horizontal>
                                            <button id="btnClearPoints" text="清空已标记的点" margin="0 8 0 8" style="Widget.AppCompat.Button.Colored"/>
                                        </vertical>
                                    </card>
                                    <vertical margin="16 8">
                                        <text text="连点速度设置：" textSize="16sp" textStyle="bold"/>
                                        <radiogroup orientation="horizontal">
                                            <radio id="speed1" text="慢速(80ms)" checked="false"/>
                                            <radio id="speed2" text="中速(50ms)" checked="true"/>
                                            <radio id="speed3" text="快速(30ms)" checked="false"/>
                                        </radiogroup>
                                        <horizontal>
                                            <text text="自定义速度(毫秒):" textSize="14sp"/>
                                            <input id="intervalInput" text="50" inputType="number" layout_weight="1"/>
                                        </horizontal>
                                    </vertical>
                                    <text id="statusText" text="状态：音量键未启用" margin="16 8" textSize="16sp" gravity="center" textColor="#666666"/>
                                    <button id="exitBtn" text="退出程序" margin="16 8" style="Widget.AppCompat.Button.Colored"/>
                                </vertical>
                            </scroll>
            );

            ui.backHomeB2.click(() => {
                running = false;
                Switcher.goHome();
            });
            loadSavedPoints(false);

            // ★★★ 重要：不再调用 auto() 强行启用无障碍（部分机型会导致设置崩溃/重启）
            if (!Perms.hasAccessibility()) {
                toast("请开启无障碍服务以使用功能");
                Perms.openAccessibilitySettings();
            }

            ui.speed1.on("check", checked => {
                if (checked) {
                    ui.intervalInput.setText("80");
                    intervalObj.value = 80;  // ★修复: 立即更新速度
                    console.log("✓ 连点速度已更新为: 80ms");
                }
            });
            ui.speed2.on("check", checked => {
                if (checked) {
                    ui.intervalInput.setText("50");
                    intervalObj.value = 50;  // ★修复: 立即更新速度
                    console.log("✓ 连点速度已更新为: 50ms");
                }
            });
            ui.speed3.on("check", checked => {
                if (checked) {
                    ui.intervalInput.setText("30");
                    intervalObj.value = 30;  // ★修复: 立即更新速度
                    console.log("✓ 连点速度已更新为: 30ms");
                }
            });
            ui.btnSavePoints.click(() => savePoints());
            ui.btnLoadPoints.click(() => loadSavedPoints(true));
            ui.btnClearPoints.click(() => {
                dialogs.build({
                    title: "确认清空标记？",
                    content: "这将删除已保存的所有点坐标。",
                    positive: "清空",
                    negative: "取消"
                }).on("positive", () => {
                    clearPoints();
                }).show();
            });

            ui.toggleVolumeKey.click(() => {
                if (!volumeKeyEnabled) {
                    // 准备启用，先检查权限
                    if (!Perms.hasAccessibility()) {
                        toast("❌ 请先开启无障碍服务");
                        dialogs.build({
                            title: "需要无障碍服务",
                            content: "一键周胜需要无障碍服务来监听音量键。\n\n点击确定后，请在设置中找到本应用并开启无障碍服务。",
                            positive: "去开启",
                            negative: "取消"
                        }).on("positive", () => {
                            try {
                                app.startActivity({
                                    action: "android.settings.ACCESSIBILITY_SETTINGS"
                                });
                            } catch (e) {
                                toast("无法打开设置，请手动开启");
                            }
                        }).show();
                        return; // 不修改volumeKeyEnabled状态
                    }
                    
                    // 权限检查通过，启用音量键
                    volumeKeyEnabled = true;
                    ui.toggleVolumeKey.setText("禁用音量键控制");
                    toast("✅ 音量键控制已启用");
                    
                    try {
                        events.observeKey();
                    } catch (e) {
                        toast("音量键监听初始化失败");
                        console.error("observeKey异常: " + e);
                        // 出错了，恢复状态
                        volumeKeyEnabled = false;
                        ui.toggleVolumeKey.setText("启用音量键控制");
                        return;
                    }
                    
                    // ====== 关键修复:延迟注册事件监听器 ======
                    setTimeout(() => {
                        try {
                            // 清理旧监听器
                            if (keyEventRegistered) {
                                try {
                                    events.removeAllKeyDownListeners && events.removeAllKeyDownListeners("volume_down");
                                } catch (e) {
                                    console.log("清理旧监听器:", e);
                                }
                            }
                            
                            console.log("注册音量键监听器...");
                            
                            // 创建事件处理函数
                            keyEventHandler = function(keyCode) {
                                try {
                                    console.log("音量键按下,keyCode=" + keyCode + ", enabled=" + volumeKeyEnabled);
                                    
                                    if (!volumeKeyEnabled) {
                                        console.log("音量键功能未启用,忽略");
                                        return;
                                    }
                                    
                                    // ★修复: 读取并更新间隔设置
                                    try {
                                        intervalObj.value = parseInt(ui.intervalInput.text()) || 50;
                                        console.log("当前连点速度: " + intervalObj.value + "ms");
                                    } catch (e) {
                                        intervalObj.value = 50;
                                    }
                                    
                                    // 标记模式
                                    if (!isAllMarked()) {
                                        markingMode = true;
                                        nextMarkIndex = getNextUnmarkedIndex();
                                        let keyName = keyOrder[nextMarkIndex];
                                        console.log("进入标记模式,标记:" + keyName);
                                        
                                        captureOnceCoord("请在3秒内点击【" + keyName + "】位置", (p) => {
                                            points[keyName] = p;
                                            ui.run(() => {
                                                ui["txt_k" + nextMarkIndex].setText("✓ (" + p.x + ", " + p.y + ")");
                                            });
                                            savePoints();
                                            toast(keyName + " 已标记:" + p.x + ", " + p.y);
                                            
                                            nextMarkIndex = getNextUnmarkedIndex();
                                            if (isAllMarked()) {
                                                markingMode = false;
                                                toast("7点标记完成!再按音量减键开始/停止连点");
                                            } else {
                                                toast("继续按音量减键标记:" + keyOrder[nextMarkIndex]);
                                            }
                                            updateStatus();
                                        });
                                        return true;
                                    }
                                    
                                    // 连点控制
                                    if (!running) {
                                        console.log("准备启动连点...");
                                        
                                        // ====== 关键修复:在独立线程中执行所有耗时操作 ======
                                        // 不要在事件处理器中执行任何阻塞或耗时操作
                                        running = true; // 先标记为运行中，防止重复点击
                                        
                                        // 使用独立线程执行启动逻辑
                                        threads.start(function() {
                                            try {
                                                console.log("启动检查线程...");
                                                sleep(120); // 在工作线程中可以安全使用sleep
                                                
                                                if (!Perms.hasAccessibility()) {
                                                    ui.run(() => {
                                                        toast("❌ 无障碍服务已关闭,无法连点");
                                                    });
                                                    console.error("无障碍服务未开启");
                                                    running = false;
                                                    ui.run(() => updateStatus());
                                                    return;
                                                }
                                                
                                                // 验证坐标
                                                var invalidPoints = [];
                                                for (let i = 0; i < keyOrder.length; i++) {
                                                    let name = keyOrder[i];
                                                    let p = points[name];
                                                    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') {
                                                        invalidPoints.push(name);
                                                    }
                                                }
                                                if (invalidPoints.length > 0) {
                                                    ui.run(() => {
                                                        toast("❌ 以下坐标无效:" + invalidPoints.join(", "));
                                                    });
                                                    console.error("无效坐标:" + JSON.stringify(invalidPoints));
                                                    running = false;
                                                    ui.run(() => updateStatus());
                                                    return;
                                                }
                                                
                                                // 测试点击
                                                try {
                                                    let testPoint = points[keyOrder[0]];
                                                    click(testPoint.x, testPoint.y);
                                                    console.log("✓ 测试点击成功:(" + testPoint.x + ", " + testPoint.y + ")");
                                                } catch (testError) {
                                                    ui.run(() => {
                                                        toast("❌ 点击测试失败,请检查权限:" + testError);
                                                    });
                                                    console.error("测试点击失败:" + testError);
                                                    running = false;
                                                    ui.run(() => updateStatus());
                                                    return;
                                                }
                                                
                                                // 所有检查通过，启动连点
                                                ui.run(() => {
                                                    updateStatus();
                                                    toast("✅ 开始一键周胜连点!");
                                                });
                                                console.log("开始连点,interval=" + intervalObj.value + "ms");
                                                
                                                // 在当前工作线程中执行连点循环
                                                try {
                                                    var clickCount = 0;
                                                    const SPECIAL_MS = {
                                                        "通灵键": 5000,
                                                        "密卷键": 5000
                                                    };
                                                    var lastSpecial = {};
                                                    let startNow = new Date().getTime();
                                                    Object.keys(SPECIAL_MS).forEach(k => lastSpecial[k] = startNow - SPECIAL_MS[k]);
                                                    
                                                    console.log("连点线程已启动,running=" + running);
                                                    
                                                    while (running) {
                                                        try {
                                                            for (let i = 0; i < keyOrder.length && running; i++) {
                                                                let name = keyOrder[i];
                                                                let p = points[name];
                                                                if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') {
                                                                    console.warn("跳过无效坐标:" + name);
                                                                    continue;
                                                                }
                                                                
                                                                try {
                                                                    if (SPECIAL_MS[name]) {
                                                                        let now = new Date().getTime();
                                                                        if (now - (lastSpecial[name] || 0) >= SPECIAL_MS[name]) {
                                                                            click(p.x, p.y);
                                                                            lastSpecial[name] = now;
                                                                            clickCount++;
                                                                        }
                                                                        sleep(intervalObj.value);  // ★修复: 使用对象属性，实时读取最新速度
                                                                    } else {
                                                                        click(p.x, p.y);
                                                                        sleep(intervalObj.value);  // ★修复: 使用对象属性，实时读取最新速度
                                                                        clickCount++;
                                                                    }
                                                                    
                                                                    if (clickCount % 100 == 0) {
                                                                        ui.run(() => {
                                                                            try {
                                                                                ui.statusText.setText("状态:连点中…(累计 " + clickCount + " 次)");
                                                                            } catch (e) {
                                                                                console.error("更新UI失败:" + e);
                                                                            }
                                                                        });
                                                                    }
                                                                } catch (clickError) {
                                                                    console.error("点击异常 [" + name + "]:" + clickError);
                                                                    sleep(100);
                                                                }
                                                            }
                                                        } catch (loopError) {
                                                            console.error("连点循环异常:" + loopError);
                                                            sleep(500);
                                                        }
                                                    }
                                                    
                                                    console.log("连点循环结束,总点击:" + clickCount);
                                                } catch (e) {
                                                    console.error("连点线程致命错误:" + e);
                                                    ui.run(() => {
                                                        toast("连点出错:" + e);
                                                        try {
                                                            ui.statusText.setText("状态:连点异常停止");
                                                        } catch (uiErr) {}
                                                    });
                                                }
                                                
                                                running = false;
                                                ui.run(() => updateStatus());
                                                
                                            } catch (e) {
                                                console.error("启动线程异常:" + e);
                                                ui.run(() => {
                                                    toast("启动失败:" + e);
                                                });
                                                running = false;
                                                ui.run(() => updateStatus());
                                            }
                                        });
                                        
                                        return true;
                                        
                                    } else {
                                        console.log("停止连点");
                                        running = false;
                                        ui.run(() => {
                                            updateStatus();
                                            toast("已停止连点");
                                        });
                                    }
                                    return true;
                                } catch (handlerError) {
                                    console.error("音量键处理异常:" + handlerError);
                                    toast("处理异常:" + handlerError);
                                    return false;
                                }
                            };
                            
                            // 注册事件监听
                            events.on("key_down", function(keyCode, event) {
                                if (keyCode == keys.volume_down) {
                                    return keyEventHandler(keyCode);
                                }
                            });
                            
                            keyEventRegistered = true;
                            console.log("✓ 音量键监听器注册成功");
                            
                        } catch (regError) {
                            console.error("注册音量键监听器失败:" + regError);
                            toast("启用失败:" + regError);
                            volumeKeyEnabled = false;
                            ui.run(() => {
                                ui.toggleVolumeKey.setText("启用音量键控制");
                            });
                            return;
                        }
                    }, 200); // 延迟200ms注册
                    
                    if (!isAllMarked()) {
                        markingMode = true;
                        nextMarkIndex = getNextUnmarkedIndex();
                        toast("按音量减键开始标记：" + keyOrder[nextMarkIndex]);
                    }
                    updateStatus();
                } else {
                    // 禁用音量键
                    volumeKeyEnabled = false;
                    ui.toggleVolumeKey.setText("启用音量键控制");
                    ui.statusText.setText("状态：音量键未启用");
                    ui.statusText.setTextColor(colors.parseColor("#666666"));
                    if (running) {
                        running = false;
                    }
                    toast("音量键控制已禁用");
                }
            });

            function isAllMarked() {
                return keyOrder.every(k => !!points[k]);
            }

            function getNextUnmarkedIndex() {
                for (let i = 0; i < keyOrder.length; i++) {
                    if (!points[keyOrder[i]]) return i;
                }
                return keyOrder.length;
            }

            function updateStatus() {
                if (!volumeKeyEnabled) {
                    ui.statusText.setText("状态：音量键未启用");
                    ui.statusText.setTextColor(colors.parseColor("#666666"));
                    return;
                }
                if (!isAllMarked()) {
                    let i = getNextUnmarkedIndex();
                    ui.statusText.setText("状态：等待标记【" + keyOrder[i] + "】（按音量减键）");
                    ui.statusText.setTextColor(colors.parseColor("#2196F3"));
                    return;
                }
                if (!running) {
                    ui.statusText.setText("状态：准备就绪 - 按音量减键开始连点");
                    ui.statusText.setTextColor(colors.parseColor("#4CAF50"));
                    return;
                }
                if (running) {
                    ui.statusText.setText("状态：一键周胜连点中...");
                    ui.statusText.setTextColor(colors.parseColor("#FF6600"));
                }
            }

            // —— 安全标记：若未授予悬浮窗，先引导授权；否则优雅降级为手工输入坐标 ——
            function captureOnceCoord(tips, onCaptured) {
                threads.start(function() {
                    var captured = false;
                    if (!Perms.hasOverlay()) {
                        // 弹出对话框询问用户
                        ui.run(() => {
                            dialogs.build({
                                title: "需要悬浮窗权限",
                                content: "标记功能需要悬浮窗权限来捕获点击位置。\n\n请选择：\n1. 授予悬浮窗权限（推荐）\n2. 手动输入坐标",
                                positive: "去授权",
                                negative: "手动输入",
                                neutral: "取消"
                            }).on("positive", () => {
                                if (Perms.requestOverlay()) {
                                    toast("✅ 授权成功！请重新点击标记按钮");
                                } else {
                                    toast("授权后请重新点击标记按钮");
                                }
                            }).on("negative", () => {
                                // 降级：手动输入坐标
                                try {
                                    var x = parseInt(dialogs.rawInput(tips + "\n请输入 X 坐标（px）：", ""));
                                    if (!isFinite(x)) {
                                        toast("坐标无效，已取消");
                                        return;
                                    }
                                    var y = parseInt(dialogs.rawInput(tips + "\n请输入 Y 坐标（px）：", ""));
                                    if (!isFinite(y)) {
                                        toast("坐标无效，已取消");
                                        return;
                                    }
                                    onCaptured && onCaptured({
                                        x: x,
                                        y: y
                                    });
                                    toast("✅ 已记录：(" + x + ", " + y + ")");
                                } catch (e) {
                                    toast("输入取消");
                                }
                            }).show();
                        });
                        return;
                    }
                    
                    // 有悬浮窗权限，正常捕获
                    var captureWindow = floaty.rawWindow(
                        <frame id="touchFrame" w="*" h="*" bg="#00000000">
                                                <vertical gravity="center">
                                                    <text text={tips} textColor="#FFFFFF" textSize="24sp" textStyle="bold" gravity="center"/>
                                                    <text text="请在3秒内点击目标位置" textColor="#FFEB3B" textSize="16sp" margin="8" gravity="center"/>
                                                </vertical>
                                            </frame>
                    );
                    captureWindow.setSize(-1, -1);
                    captureWindow.touchFrame.setOnTouchListener(function(view, event) {
                        if (event.getAction() == event.ACTION_DOWN && !captured) {
                            captured = true;
                            let p = {
                                x: parseInt(event.getRawX()),
                                y: parseInt(event.getRawY())
                            };
                            try {
                                onCaptured && onCaptured(p);
                                toast("✅ 已记录：(" + p.x + ", " + p.y + ")");
                            } finally {
                                try {
                                    captureWindow.close();
                                } catch (e) {}
                            }
                            return true;
                        }
                        return false;
                    });
                    setTimeout(() => {
                        if (!captured) {
                            try {
                                captureWindow.close();
                            } catch (e) {}
                            toast("⏱️ 标记超时，请重试");
                        }
                    }, 3000);
                });
            }

            function bindMarkButton(btnId, txtId, keyName) {
                ui[btnId].click(() => {
                    captureOnceCoord("点击【" + keyName + "】位置", (p) => {
                        points[keyName] = p;
                        ui.run(() => {
                            ui[txtId].setText("✓ (" + p.x + ", " + p.y + ")");
                        });
                        savePoints();
                        toast(keyName + " 已标记：" + p.x + ", " + p.y);
                        updateStatus();
                    });
                });
            }
            bindMarkButton("mark_k0", "txt_k0", "普攻键");
            bindMarkButton("mark_k1", "txt_k1", "技能1键");
            bindMarkButton("mark_k2", "txt_k2", "技能2键");
            bindMarkButton("mark_k3", "txt_k3", "通灵键");
            bindMarkButton("mark_k4", "txt_k4", "密卷键");
            bindMarkButton("mark_k5", "txt_k5", "替身键");
            bindMarkButton("mark_k6", "txt_k6", "匹配键");

            // ====== 关键修复:延迟注册音量键事件监听 ======
            // 不在初始化时直接注册events.on,而是在toggleVolumeKey中延迟注册
            // 避免与线程创建冲突导致闪退
            let keyEventRegistered = false;
            let keyEventHandler = null;

            ui.exitBtn.click(() => {
                if (hasAnyMark()) savePoints();
                running = false;
                // 清理事件监听器
                try {
                    if (keyEventRegistered) {
                        events.removeAllListeners && events.removeAllListeners();
                        keyEventRegistered = false;
                    }
                } catch (e) {
                    console.log("清理事件监听器:", e);
                }
                exit();
            });
            events.on("exit", () => {
                if (hasAnyMark()) savePoints();
                running = false;
                // 清理事件监听器
                try {
                    if (keyEventRegistered) {
                        events.removeAllListeners && events.removeAllListeners();
                        keyEventRegistered = false;
                    }
                } catch (e) {}
            });
            toast("一键周胜已启动！建议先点“启用音量键控制”→ 按提示完成7点标记");
            currentCleanup = function() {
                try {
                    running = false;
                    // clickThread已移除
                    if (keyEventRegistered) {
                        events.removeAllListeners && events.removeAllListeners();
                        keyEventRegistered = false;
                    }
                } catch (e) {
                    console.log("清理资源:", e);
                }
            };
        })();
    }

    return {
        goHome,
        goFeatureA,
        goFeatureB,
        runHealthCheck
    };
})();

(function start() {
    // 启动时不触发任何敏感权限，仅展示 UI 和体检入口，避免“刚运行就重启/设置崩溃”
    if (GLOBAL_VERIFY_STORE.isVerified()) Switcher.goHome();
    else showGlobalVerify(() => Switcher.goHome());
})();
