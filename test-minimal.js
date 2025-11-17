"ui";

// 最简化测试 - AutoX.js v6.5.2
try {
    toast("开始测试...");

    ui.layout(
        <vertical padding="16" bg="#FFFFFF">
            <text text="测试界面" textSize="24sp" margin="16"/>
            <button id="testBtn" text="测试按钮" margin="16"/>
        </vertical>
    );

    ui.testBtn.click(function() {
        toast("按钮点击成功！");
    });

    toast("UI加载成功！");
} catch (e) {
    toast("错误: " + e);
    console.log("错误详情: " + e);
}
