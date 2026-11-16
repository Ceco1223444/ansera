' Ansera tunnel launcher: starts the self-healing tunnel + sync script hidden.
' To run it at every logon, put a shortcut to this file in shell:startup.
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & here & "\tunnel-sync.ps1""", 0, False
