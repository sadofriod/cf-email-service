-- Automator setup: New Quick Action -> Workflow receives "text" -> Run AppleScript.
-- Replace the action's contents with this script, then save it as "CloudMail".
-- Assign a keyboard shortcut in System Settings -> Keyboard -> Keyboard Shortcuts -> Services.
on run {input, parameters}
	set cloudmailPath to (POSIX path of (path to home folder)) & "bin/cloudmail"
	tell application "System Events"
		if not (exists disk item cloudmailPath) then
			display dialog "CloudMail is not installed. Run: bash mac/install.sh" buttons {"OK"} default button "OK" with icon stop
			return input
		end if
	end tell

	set selectedText to ""
	if input is not {} then set selectedText to (input as text)
	if selectedText is "" then
		try
			set selectedText to the clipboard as text
		end try
	end if

	set recipientDialog to display dialog "Recipient email address:" default answer "" buttons {"Cancel", "Continue"} default button "Continue"
	set recipient to text returned of recipientDialog
	set subjectDialog to display dialog "Email subject:" default answer "" buttons {"Cancel", "Send"} default button "Send"
	set subjectLine to text returned of subjectDialog

	try
		do shell script quoted form of cloudmailPath & " -t " & quoted form of recipient & " -s " & quoted form of subjectLine & " -m " & quoted form of selectedText
		display notification "Message sent" with title "CloudMail"
	on error errorMessage
		display dialog errorMessage buttons {"OK"} default button "OK" with icon stop
	end try

	return input
end run
