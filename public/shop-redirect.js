const accountLink = /^#(?:verify|reset)=/.test(location.hash)
location.replace(`/${location.search}${accountLink ? location.hash : '#sortiment'}`)
