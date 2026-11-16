' Ansera ops-service launcher: starts the local status/heal service hidden.
' To run it at every logon, put a shortcut to this file in shell:startup.
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "node """ & here & "\ops-service.mjs""", 0, False
