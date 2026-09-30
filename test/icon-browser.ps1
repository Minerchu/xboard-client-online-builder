param([string]$Browser = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', [string]$PageUrl)
$ErrorActionPreference = 'Stop'
$profileDir = Join-Path $env:TEMP ('xboard-icon-test-' + [guid]::NewGuid().ToString('N'))
$pageUri = (New-Object System.Uri((Join-Path $PSScriptRoot 'icon-browser.html'))).AbsoluteUri
if ($PageUrl) { $pageUri = $PageUrl }
$browserProcess = Start-Process -FilePath $Browser -ArgumentList @('--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=19225', "--user-data-dir=$profileDir", $pageUri) -WindowStyle Hidden -PassThru
$socket = New-Object System.Net.WebSockets.ClientWebSocket
try {
    $page = $null
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try { $pages = Invoke-RestMethod 'http://127.0.0.1:19225/json/list'; $page = $pages | Where-Object type -eq 'page' | Select-Object -First 1 } catch {}
        if ($page) { break }
        Start-Sleep -Milliseconds 200
    }
    if (-not $page) { throw 'Browser debugging endpoint did not start' }
    $null = $socket.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $expression = '(async()=>{for(let i=0;i<150;i++){const state=document.getElementById("results").dataset.state;if(state)return {state,text:document.getElementById("results").textContent,ico:document.getElementById("ico").textContent};await new Promise(r=>setTimeout(r,100))}throw Error("Browser test timed out")})()'
    $command = @{ id = 1; method = 'Runtime.evaluate'; params = @{ expression = $expression; awaitPromise = $true; returnByValue = $true } } | ConvertTo-Json -Depth 6 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($command)
    $null = $socket.SendAsync([ArraySegment[byte]]::new($bytes), [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $response = $null
    while (-not $response) {
        $message = New-Object IO.MemoryStream
        do {
            $buffer = New-Object byte[] 65536
            $received = $socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), [Threading.CancellationToken]::None).GetAwaiter().GetResult()
            $message.Write($buffer, 0, $received.Count)
        } while (-not $received.EndOfMessage)
        $data = [Text.Encoding]::UTF8.GetString($message.ToArray()) | ConvertFrom-Json
        $message.Dispose()
        if ($data.id -eq 1) { $response = $data }
    }
    if ($response.result.exceptionDetails) { throw ($response.result.exceptionDetails | ConvertTo-Json -Depth 8) }
    $result = $response.result.result.value
    Write-Output $result.text
    if ($result.state -ne 'passed') { throw 'Icon conversion tests failed' }
    [IO.File]::WriteAllBytes((Join-Path $env:TEMP 'xboard-converted-test.ico'), [Convert]::FromBase64String($result.ico))
} finally {
    $socket.Dispose()
    Stop-Process -Id $browserProcess.Id -ErrorAction SilentlyContinue
}
