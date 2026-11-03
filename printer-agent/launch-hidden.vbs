' Agentni konsol oynasisiz ishga tushiradi (avtomatik ishga tushirish shu fayl orqali)
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
sh.Run "node """ & dir & "\agent.mjs""", 0, False
