const dns = require('dns').promises;
const net = require('net');

class VerificationService {
  constructor() {
    this.emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    // Expanded disposable email domains (500+ common ones)
    this.disposableDomains = new Set([
      // Major disposable services
      'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmailo.com', 'tempmail.net',
      'throwaway.email', 'throwawaymail.com', 'throam.com',
      'guerrillamail.com', 'guerrillamail.org', 'guerrillamail.net', 'guerrillamail.biz', 'guerrillamailblock.com',
      'mailinator.com', 'mailinator.net', 'mailinator.org', 'mailinator2.com',
      '10minutemail.com', '10minutemail.net', '10minutemail.org', '10minmail.com',
      'fakeinbox.com', 'fakemailgenerator.com', 'fakemail.net',
      'trashmail.com', 'trashmail.net', 'trashmail.org', 'trashemail.de',
      'sharklasers.com', 'guerrillamail.info', 'grr.la', 'spam4.me',
      'dispostable.com', 'disposable.com', 'disposableemailaddresses.com',
      'yopmail.com', 'yopmail.fr', 'yopmail.net', 'cool.fr.nf', 'jetable.fr.nf',
      'getnada.com', 'nada.email', 'tempail.com', 'emailondeck.com',
      'mohmal.com', 'mohmal.im', 'mohmal.tech',
      'maildrop.cc', 'mailnesia.com', 'mailcatch.com',
      'mintemail.com', 'mt2009.com', 'mytrashmail.com',
      'getairmail.com', 'airmail.com', 'anonbox.net',
      'anonymbox.com', 'antispam.de', 'brefmail.com',
      'bugmenot.com', 'bumpymail.com', 'casualdx.com',
      'chogmail.com', 'choicemail1.com', 'clipmail.eu',
      'crazymailing.com', 'deadaddress.com', 'despam.it',
      'devnullmail.com', 'dfgh.net', 'digitalsanctuary.com',
      'discardmail.com', 'discardmail.de', 'disposableaddress.com',
      'disposableemailaddresses.emailmiser.com', 'disposableinbox.com',
      'dispose.it', 'disposeamail.com', 'disposemail.com',
      'dm.w3internet.co.uk', 'dodgeit.com', 'dodgemail.de',
      'dontreg.com', 'dontsendmespam.de', 'dump-email.info',
      'dumpmail.de', 'dumpyemail.com', 'e4ward.com',
      'email60.com', 'emaildienst.de', 'emailgo.de',
      'emailias.com', 'emailigo.de', 'emailinfive.com',
      'emaillime.com', 'emailmiser.com', 'emailsensei.com',
      'emailtemporanea.com', 'emailtemporanea.net', 'emailtemporar.ro',
      'emailtemporario.com.br', 'emailthe.net', 'emailtmp.com',
      'emailto.de', 'emailwarden.com', 'emailx.at.hm',
      'emailxfer.com', 'emz.net', 'enterto.com',
      'ephemail.net', 'etranquil.com', 'etranquil.net',
      'etranquil.org', 'evopo.com', 'explodemail.com',
      'express.net.ua', 'eyepaste.com', 'fakeinformation.com',
      'fastacura.com', 'fastchevy.com', 'fastchrysler.com',
      'fastkawasaki.com', 'fastmazda.com', 'fastmitsubishi.com',
      'fastnissan.com', 'fastsubaru.com', 'fastsuzuki.com',
      'fasttoyota.com', 'fastyamaha.com', 'filzmail.com',
      'fizmail.com', 'flyspam.com', 'fr33mail.info',
      'frapmail.com', 'friendlymail.co.uk', 'front14.org',
      'fuckingduh.com', 'fudgerub.com', 'garliclife.com',
      'gehensipp.de', 'get1mail.com', 'get2mail.fr',
      'getonemail.com', 'getonemail.net', 'ghosttexter.de',
      'giantmail.de', 'girlsundertheinfluence.com', 'gishpuppy.com',
      'goemailgo.com', 'gorillaswithdirtyarmpits.com', 'gotmail.com',
      'gotmail.net', 'gotmail.org', 'gowikibooks.com',
      'gowikicampus.com', 'gowikicars.com', 'gowikifilms.com',
      'great-host.in', 'greensloth.com', 'gsrv.co.uk',
      'guerillamail.biz', 'guerillamail.com', 'guerillamail.de',
      'guerillamail.info', 'guerillamail.net', 'guerillamail.org',
      'guerrillamail.de', 'h8s.org', 'haltospam.com',
      'hatespam.org', 'hidemail.de', 'hidzz.com',
      'hmamail.com', 'hochsitze.com', 'hopemail.biz',
      'hotpop.com', 'hulapla.de', 'ieatspam.eu',
      'ieatspam.info', 'ihateyoualot.info', 'imails.info',
      'imgof.com', 'imgv.de', 'incognitomail.com',
      'incognitomail.net', 'incognitomail.org', 'inoutmail.de',
      'inoutmail.eu', 'inoutmail.info', 'inoutmail.net',
      'insorg-mail.info', 'instant-mail.de', 'instantemailaddress.com',
      'ipoo.org', 'irish2me.com', 'iwi.net',
      'jetable.com', 'jetable.net', 'jetable.org',
      'jnxjn.com', 'jourrapide.com', 'jsrsolutions.com',
      'junk1.com', 'kasmail.com', 'kaspop.com',
      'keepmymail.com', 'killmail.com', 'killmail.net',
      'kimsdisk.com', 'kingsq.ga', 'kiois.com',
      'klassmaster.com', 'klassmaster.net', 'klzlv.com',
      'kulturbetrieb.info', 'kurzepost.de', 'lawlita.com',
      'lazyinbox.com', 'letthemeatspam.com', 'lhsdv.com',
      'lifebyfood.com', 'link2mail.net', 'litedrop.com',
      'lol.ovpn.to', 'lookugly.com', 'lopl.co.cc',
      'lortemail.dk', 'lovemeleaveme.com', 'lr78.com',
      'maboard.com', 'mail-hierarchie.net', 'mail-temporaire.fr',
      'mail.by', 'mail.mezimages.net', 'mail.zp.ua',
      'mail114.net', 'mail2rss.org', 'mail333.com',
      'mail4trash.com', 'mailbidon.com', 'mailblocks.com',
      'mailbucket.org', 'mailcat.biz', 'mailcatch.com',
      'mailde.de', 'mailde.info', 'maildrop.cc',
      'maildrop.cf', 'maildrop.ga', 'maildrop.gq',
      'maildrop.ml', 'maildu.de', 'maildx.com',
      'mailed.in', 'mailexpire.com', 'mailfa.tk',
      'mailfork.com', 'mailfreeonline.com', 'mailguard.me',
      'mailimate.com', 'mailin8r.com', 'mailinater.com',
      'mailinator.net', 'mailinator.org', 'mailinator.us',
      'mailinator2.com', 'mailincubator.com', 'mailismagic.com',
      'mailjunk.cf', 'mailjunk.ga', 'mailjunk.gq',
      'mailjunk.ml', 'mailjunk.tk', 'mailmate.com',
      'mailme.gq', 'mailme.ir', 'mailme.lv',
      'mailme24.com', 'mailmetrash.com', 'mailmoat.com',
      'mailnator.com', 'mailnesia.com', 'mailnull.com',
      'mailorg.org', 'mailpick.biz', 'mailproxsy.com',
      'mailquack.com', 'mailrock.biz', 'mailscrap.com',
      'mailshell.com', 'mailsiphon.com', 'mailslapping.com',
      'mailslite.com', 'mailtemp.info', 'mailtothis.com',
      'mailzilla.com', 'mailzilla.org', 'makemetheking.com',
      'manybrain.com', 'mbx.cc', 'mega.zik.dj',
      'meinspamschutz.de', 'meltmail.com', 'messagebeamer.de',
      'mezimages.net', 'mierdamail.com', 'migumail.com',
      'mintemail.com', 'mjukgansen.nu', 'moakt.com',
      'mobi.web.id', 'mobileninja.co.uk', 'moburl.com',
      'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf',
      'monumentmail.com', 'ms9.mailslite.com', 'mswork.net',
      'mt2009.com', 'mt2014.com', 'myalias.pw',
      'mycleaninbox.net', 'myemailboxy.com', 'myhashmail.com',
      'mynetstore.de', 'mypacks.net', 'mypartyclip.de',
      'myphantomemail.com', 'myspaceinc.com', 'myspaceinc.net',
      'myspacepimpedup.com', 'myspamless.com', 'mytempemail.com',
      'mytrashmail.com', 'mytrashemail.com', 'neomailbox.com',
      'nervmich.net', 'nervtmansen.de', 'netmails.com',
      'netmails.net', 'netzidiot.de', 'neverbox.com',
      'nice-4u.com', 'nincsmail.hu', 'nmail.cf',
      'nobulk.com', 'noclickemail.com', 'nogmailspam.info',
      'nomail.xl.cx', 'nomail2me.com', 'nomorespamemails.com',
      'nospam.ze.tc', 'nospam4.us', 'nospamfor.us',
      'nospammail.net', 'nospamthanks.info', 'notmailinator.com',
      'nowhere.org', 'nowmymail.com', 'nurfuerspam.de',
      'nus.edu.sg', 'nwldx.com', 'objectmail.com',
      'obobbo.com', 'odnorazovoe.ru', 'one-time.email',
      'oneoffemail.com', 'onewaymail.com', 'onlatedotcom.info',
      'online.ms', 'oopi.org', 'opayq.com',
      'ordinaryamerican.net', 'otherinbox.com', 'ourklips.com',
      'outlawspam.com', 'ovpn.to', 'owlpic.com',
      'pancakemail.com', 'pjjkp.com', 'plexolan.de',
      'poczta.onet.pl', 'politikerclub.de', 'poofy.org',
      'pookmail.com', 'privacy.net', 'privatdemail.net',
      'privy-mail.com', 'privymail.de', 'proxymail.eu',
      'prtnx.com', 'punkass.com', 'putthisinyourspamdatabase.com',
      'qq.com', 'quickinbox.com', 'quickmail.nl',
      'rcpt.at', 're-gister.com', 'reallymymail.com',
      'realtyalerts.ca', 'recode.me', 'recursor.net',
      'recyclemail.dk', 'regbypass.com', 'regbypass.comsafe-mail.net',
      'rejectmail.com', 'reliable-mail.com', 'remail.cf',
      'remail.ga', 'rhyta.com', 'rklips.com',
      'rmqkr.net', 'royal.net', 'rppkn.com',
      'rtrtr.com', 's0ny.net', 'safe-mail.net',
      'safersignup.de', 'safetymail.info', 'safetypost.de',
      'sandelf.de', 'saynotospams.com', 'schafmail.de',
      'schrott-email.de', 'secretemail.de', 'secure-mail.biz',
      'selfdestructingmail.com', 'sendspamhere.com', 'senseless-entertainment.com',
      'server.ms.selfip.net', 'sharklasers.com', 'shieldemail.com',
      'shiftmail.com', 'shitmail.me', 'shortmail.net',
      'shut.name', 'shut.ws', 'sibmail.com',
      'sinnlos-mail.de', 'siteposter.net', 'skeefmail.com',
      'slaskpost.se', 'slave-auctions.net', 'slopsbox.com',
      'slushmail.com', 'smashmail.de', 'smellfear.com',
      'snakemail.com', 'sneakemail.com', 'sneakmail.de',
      'snkmail.com', 'sofimail.com', 'sofort-mail.de',
      'softpls.asia', 'sogetthis.com', 'sohu.com',
      'soisz.com', 'solvemail.info', 'soodonims.com',
      'spam.la', 'spam.su', 'spam4.me',
      'spamavert.com', 'spambob.com', 'spambob.net',
      'spambob.org', 'spambog.com', 'spambog.de',
      'spambog.net', 'spambog.ru', 'spambox.info',
      'spambox.irishspringrealty.com', 'spambox.us', 'spamcannon.com',
      'spamcannon.net', 'spamcero.com', 'spamcon.org',
      'spamcorptastic.com', 'spamcowboy.com', 'spamcowboy.net',
      'spamcowboy.org', 'spamday.com', 'spameater.com',
      'spameater.org', 'spamex.com', 'spamfree.eu',
      'spamfree24.com', 'spamfree24.de', 'spamfree24.eu',
      'spamfree24.info', 'spamfree24.net', 'spamfree24.org',
      'spamgoes.in', 'spamgourmet.com', 'spamgourmet.net',
      'spamgourmet.org', 'spamherelots.com', 'spamhereplease.com',
      'spamhole.com', 'spamify.com', 'spaminator.de',
      'spamkill.info', 'spaml.com', 'spaml.de',
      'spamlot.net', 'spammotel.com', 'spamobox.com',
      'spamoff.de', 'spamsalad.in', 'spamslicer.com',
      'spamspot.com', 'spamthis.co.uk', 'spamthisplease.com',
      'spamtrail.com', 'spamtroll.net', 'speed.1s.fr',
      'spoofmail.de', 'squizzy.de', 'ssoia.com',
      'startkeys.com', 'stinkefinger.net', 'stop-my-spam.cf',
      'stop-my-spam.com', 'stop-my-spam.ga', 'stop-my-spam.ml',
      'stop-my-spam.tk', 'streetwisemail.com', 'stuffmail.de',
      'super-auswahl.de', 'supergreatmail.com', 'supermailer.jp',
      'superrito.com', 'superstachel.de', 'suremail.info',
      'svk.jp', 'sweetxxx.de', 'tafmail.com',
      'tagyourself.com', 'talkinator.com', 'tapchicuoihoi.com',
      'techemail.com', 'techgroup.me', 'teewars.org',
      'teleosaurs.xyz', 'temp.emeraldwebmail.com', 'temp.headstrong.de',
      'tempail.com', 'tempalias.com', 'tempe-mail.com',
      'tempemail.biz', 'tempemail.co.za', 'tempemail.com',
      'tempemail.net', 'tempinbox.co.uk', 'tempinbox.com',
      'tempmail.co', 'tempmail.de', 'tempmail.eu',
      'tempmail.it', 'tempmail.net', 'tempmail.org',
      'tempmail2.com', 'tempmaildemo.com', 'tempmailer.com',
      'tempomail.fr', 'temporarily.de', 'temporarioemail.com.br',
      'temporaryemail.net', 'temporaryemail.us', 'temporaryforwarding.com',
      'temporaryinbox.com', 'temporarymailaddress.com', 'thanksnospam.info',
      'thankyou2010.com', 'thecloudindex.com', 'thelimestones.com',
      'thisisnotmyrealemail.com', 'throam.com', 'throwam.com',
      'throwawayemailaddress.com', 'throwawaymail.com', 'tilien.com',
      'tittbit.in', 'tmailinator.com', 'tmail.ws',
      'toiea.com', 'tokenmail.de', 'toomail.biz',
      'topranklist.de', 'tradermail.info', 'trash-amil.com',
      'trash-mail.at', 'trash-mail.com', 'trash-mail.de',
      'trash-mail.ga', 'trash-mail.gq', 'trash-mail.ml',
      'trash-mail.tk', 'trash2009.com', 'trash2010.com',
      'trash2011.com', 'trashcanmail.com', 'trashdevil.com',
      'trashdevil.de', 'trashemail.de', 'trashmail.at',
      'trashmail.com', 'trashmail.de', 'trashmail.me',
      'trashmail.net', 'trashmail.org', 'trashmail.ws',
      'trashmailer.com', 'trashymail.com', 'trashymail.net',
      'trbvm.com', 'trickmail.net', 'trillianpro.com',
      'tryalert.com', 'turual.com', 'twinmail.de',
      'twoweirdtricks.com', 'tyldd.com', 'uggsrock.com',
      'umail.net', 'upliftnow.com', 'uplipht.com',
      'uroid.com', 'us.af', 'valemail.net',
      'venompen.com', 'veryrealemail.com', 'viditag.com',
      'viralplays.com', 'vkcode.ru', 'vpn.st',
      'vsimcard.com', 'vubby.com', 'walala.org',
      'walkmail.net', 'webemail.me', 'webm4il.info',
      'webuser.in', 'wee.my', 'weg-werf-email.de',
      'wegwerf-email-addressen.de', 'wegwerf-emails.de', 'wegwerfadresse.de',
      'wegwerfemail.com', 'wegwerfemail.de', 'wegwerfmail.de',
      'wegwerfmail.info', 'wegwerfmail.net', 'wegwerfmail.org',
      'wetrainbayarea.com', 'wetrainbayarea.org', 'wh4f.org',
      'whatiaas.com', 'whatpaas.com', 'whopy.com',
      'whtjddn.33mail.com', 'whyspam.me', 'willhackforfood.biz',
      'willselfdestruct.com', 'winemaven.info', 'wolfsmail.tk',
      'writeme.us', 'wronghead.com', 'wuzup.net',
      'wuzupmail.net', 'wwwnew.eu', 'xagloo.co',
      'xagloo.com', 'xemaps.com', 'xents.com',
      'xmaily.com', 'xoxy.net', 'yapped.net',
      'yep.it', 'yogamaven.com', 'yopmail.com',
      'yopmail.fr', 'yopmail.net', 'yourdomain.com',
      'ypmail.webarnak.fr.eu.org', 'yuurok.com', 'zehnminuten.de',
      'zehnminutenmail.de', 'zetmail.com', 'zippymail.info',
      'zoaxe.com', 'zoemail.com', 'zoemail.net',
      'zoemail.org', 'zomg.info', 'zxcv.com', 'zxcvbnm.com', 'zzz.com'
    ]);

    // Common role-based prefixes (often not real people)
    this.roleBasedPrefixes = [
      'admin', 'administrator', 'webmaster', 'hostmaster', 'postmaster',
      'info', 'support', 'sales', 'marketing', 'help', 'contact',
      'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon',
      'abuse', 'spam', 'security', 'billing', 'accounts', 'service',
      'hello', 'hi', 'enquiry', 'enquiries', 'feedback', 'office',
      'team', 'staff', 'jobs', 'careers', 'hr', 'recruitment',
      'press', 'media', 'news', 'newsletter', 'subscribe', 'unsubscribe',
      'orders', 'order', 'purchase', 'buy', 'shop', 'store',
      'legal', 'compliance', 'privacy', 'gdpr', 'dmca',
      'root', 'sysadmin', 'it', 'tech', 'technical', 'helpdesk',
      'customerservice', 'customercare', 'cs', 'cx', 'reception',
      'all', 'everyone', 'company', 'general', 'main', 'default'
    ];

    // SMTP response code meanings
    this.smtpCodes = {
      250: { status: 'valid', meaning: 'Requested action okay, completed' },
      251: { status: 'valid', meaning: 'User not local; will forward' },
      252: { status: 'unknown', meaning: 'Cannot verify user, but will accept' },
      450: { status: 'temporary', meaning: 'Mailbox unavailable (busy)' },
      451: { status: 'temporary', meaning: 'Local error in processing' },
      452: { status: 'temporary', meaning: 'Insufficient system storage' },
      550: { status: 'invalid', meaning: 'Mailbox unavailable (not found)' },
      551: { status: 'invalid', meaning: 'User not local' },
      552: { status: 'temporary', meaning: 'Mailbox full' },
      553: { status: 'invalid', meaning: 'Mailbox name not allowed' },
      554: { status: 'invalid', meaning: 'Transaction failed' }
    };
  }

  validateSyntax(email) {
    if (!email || typeof email !== 'string') {
      return { valid: false, reason: 'Empty or invalid input' };
    }

    const trimmed = email.trim().toLowerCase();
    
    if (!this.emailRegex.test(trimmed)) {
      return { valid: false, reason: 'Invalid email format' };
    }

    if (trimmed.length > 254) {
      return { valid: false, reason: 'Email too long' };
    }

    const [localPart, domain] = trimmed.split('@');
    
    if (!localPart || !domain) {
      return { valid: false, reason: 'Missing local part or domain' };
    }

    if (localPart.length > 64) {
      return { valid: false, reason: 'Local part too long' };
    }

    return { valid: true, email: trimmed, localPart, domain };
  }

  async checkMxRecords(domain) {
    try {
      const records = await dns.resolveMx(domain);
      if (records && records.length > 0) {
        records.sort((a, b) => a.priority - b.priority);
        return { 
          valid: true, 
          mxRecords: records.map(r => r.exchange),
          primaryMx: records[0].exchange
        };
      }
      return { valid: false, reason: 'No MX records found' };
    } catch (error) {
      if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
        return { valid: false, reason: 'Domain does not exist' };
      }
      return { valid: false, reason: `DNS error: ${error.message}` };
    }
  }

  checkDisposable(domain) {
    return this.disposableDomains.has(domain.toLowerCase());
  }

  checkRoleBased(localPart) {
    const lower = localPart.toLowerCase();
    return this.roleBasedPrefixes.some(prefix => 
      lower === prefix || lower.startsWith(prefix + '.') || lower.startsWith(prefix + '_')
    );
  }

  // Real SMTP mailbox verification using RCPT TO
  async verifyMailboxSMTP(email, mxHost, timeout = 10000) {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        socket.destroy();
        resolve({ 
          valid: false, 
          status: 'timeout',
          reason: 'Connection timeout',
          smtpCode: null,
          smtpResponse: 'Connection timed out'
        });
      }, timeout);

      const socket = net.createConnection(25, mxHost);
      let step = 0;
      let lastResponse = '';
      let smtpCode = null;

      const cleanup = () => {
        clearTimeout(timeoutId);
        try { socket.destroy(); } catch (e) {}
      };

      socket.setEncoding('utf8');

      socket.on('data', (data) => {
        lastResponse = data.toString().trim();
        const code = parseInt(lastResponse.substring(0, 3), 10);

        if (step === 0) {
          // Server greeting
          if (lastResponse.startsWith('220')) {
            socket.write(`EHLO bulky.local\r\n`);
            step++;
          } else {
            cleanup();
            resolve({ valid: false, status: 'error', reason: 'Server rejected connection', smtpCode: code, smtpResponse: lastResponse });
          }
        } else if (step === 1) {
          // EHLO response
          if (lastResponse.startsWith('250')) {
            socket.write(`MAIL FROM:<verify@bulky.local>\r\n`);
            step++;
          } else {
            // Try HELO instead
            socket.write(`HELO bulky.local\r\n`);
            step = 10; // Alternative path
          }
        } else if (step === 10) {
          // HELO response (fallback)
          if (lastResponse.startsWith('250')) {
            socket.write(`MAIL FROM:<verify@bulky.local>\r\n`);
            step = 2;
          } else {
            cleanup();
            resolve({ valid: false, status: 'error', reason: 'Server rejected HELO', smtpCode: code, smtpResponse: lastResponse });
          }
        } else if (step === 2) {
          // MAIL FROM response
          if (lastResponse.startsWith('250')) {
            socket.write(`RCPT TO:<${email}>\r\n`);
            step++;
          } else {
            cleanup();
            resolve({ valid: false, status: 'error', reason: 'Server rejected sender', smtpCode: code, smtpResponse: lastResponse });
          }
        } else if (step === 3) {
          // RCPT TO response - THE KEY CHECK
          smtpCode = code;
          socket.write(`QUIT\r\n`);
          cleanup();

          const codeInfo = this.smtpCodes[code] || { status: 'unknown', meaning: 'Unknown response' };
          
          if (code === 250 || code === 251) {
            resolve({ 
              valid: true, 
              status: 'valid',
              deliverable: true,
              reason: 'Mailbox exists',
              smtpCode: code,
              smtpResponse: lastResponse
            });
          } else if (code === 252) {
            resolve({ 
              valid: true, 
              status: 'unknown',
              deliverable: 'unknown',
              reason: 'Server cannot verify but will accept',
              smtpCode: code,
              smtpResponse: lastResponse
            });
          } else if (code === 550 || code === 551 || code === 553 || code === 554) {
            resolve({ 
              valid: false, 
              status: 'invalid',
              deliverable: false,
              reason: codeInfo.meaning,
              smtpCode: code,
              smtpResponse: lastResponse
            });
          } else if (code === 450 || code === 451 || code === 452 || code === 552) {
            resolve({ 
              valid: true, 
              status: 'temporary',
              deliverable: 'temporary_issue',
              reason: codeInfo.meaning,
              smtpCode: code,
              smtpResponse: lastResponse
            });
          } else {
            resolve({ 
              valid: true, 
              status: 'unknown',
              deliverable: 'unknown',
              reason: `Unexpected response code: ${code}`,
              smtpCode: code,
              smtpResponse: lastResponse
            });
          }
        }
      });

      socket.on('error', (err) => {
        cleanup();
        resolve({ 
          valid: true, 
          status: 'error',
          deliverable: 'unknown',
          reason: `Connection error: ${err.message}`,
          smtpCode: null,
          smtpResponse: err.message
        });
      });

      socket.on('close', () => {
        clearTimeout(timeoutId);
      });
    });
  }

  // Detect catch-all domains by testing a random nonexistent address
  async detectCatchAll(domain, mxHost) {
    const randomEmail = `bulky_test_${Date.now()}_${Math.random().toString(36).substring(7)}@${domain}`;
    try {
      const result = await this.verifyMailboxSMTP(randomEmail, mxHost, 8000);
      // If a random address is accepted, it's a catch-all domain
      if (result.valid && result.smtpCode === 250) {
        return { isCatchAll: true, reason: 'Domain accepts all addresses' };
      }
      return { isCatchAll: false };
    } catch (error) {
      return { isCatchAll: false, error: error.message };
    }
  }

  // Main verification method with all checks
  async verifyEmail(email, options = {}) {
    const { skipSmtpCheck = false, checkCatchAll = true } = options;
    
    const result = {
      email: email,
      status: 'unknown',
      score: 0,
      checks: {},
      details: {
        method: 'full',
        smtpCode: null,
        smtpResponse: null,
        isCatchAll: false,
        isDisposable: false,
        isRoleBased: false
      }
    };

    // Step 1: Syntax validation
    const syntaxResult = this.validateSyntax(email);
    result.checks.syntax = syntaxResult.valid;
    
    if (!syntaxResult.valid) {
      result.status = 'invalid';
      result.reason = syntaxResult.reason;
      result.details.method = 'syntax_only';
      return result;
    }

    result.email = syntaxResult.email;
    result.score += 20;

    // Step 2: Check if disposable
    const isDisposable = this.checkDisposable(syntaxResult.domain);
    result.checks.disposable = !isDisposable;
    result.details.isDisposable = isDisposable;
    
    if (isDisposable) {
      result.status = 'risky';
      result.reason = 'Disposable email domain';
      result.score = 25; // Low score for disposable
      result.details.method = 'disposable_check';
      return result;
    }
    result.score += 15;

    // Step 3: Check if role-based
    const isRoleBased = this.checkRoleBased(syntaxResult.localPart);
    result.checks.roleBased = !isRoleBased;
    result.details.isRoleBased = isRoleBased;
    
    if (isRoleBased) {
      result.score -= 10; // Penalty but continue verification
    } else {
      result.score += 10;
    }

    // Step 4: MX record check
    const mxResult = await this.checkMxRecords(syntaxResult.domain);
    result.checks.mxRecords = mxResult.valid;
    
    if (!mxResult.valid) {
      result.status = 'invalid';
      result.reason = mxResult.reason;
      result.details.method = 'dns_only';
      return result;
    }
    result.score += 20;

    // Step 5: SMTP mailbox verification
    if (!skipSmtpCheck) {
      try {
        // First check for catch-all if enabled
        if (checkCatchAll) {
          const catchAllResult = await this.detectCatchAll(syntaxResult.domain, mxResult.primaryMx);
          result.details.isCatchAll = catchAllResult.isCatchAll;
          
          if (catchAllResult.isCatchAll) {
            result.checks.catchAll = false;
            result.score -= 15; // Can't truly verify on catch-all domains
          } else {
            result.checks.catchAll = true;
          }
        }

        // Now verify the actual email
        const smtpResult = await this.verifyMailboxSMTP(result.email, mxResult.primaryMx);
        result.checks.smtp = smtpResult.valid;
        result.details.smtpCode = smtpResult.smtpCode;
        result.details.smtpResponse = smtpResult.smtpResponse;
        result.details.method = 'smtp';

        if (!smtpResult.valid) {
          result.status = 'invalid';
          result.reason = smtpResult.reason;
          result.score = Math.max(0, result.score - 30);
          return result;
        }
        
        if (smtpResult.deliverable === true) {
          result.score += 25;
        } else if (smtpResult.deliverable === 'temporary_issue') {
          result.score += 10;
          result.reason = smtpResult.reason;
        } else {
          result.score += 5;
        }
      } catch (error) {
        result.checks.smtp = 'skipped';
        result.details.method = 'dns_only';
        result.score += 5;
      }
    } else {
      result.checks.smtp = 'skipped';
      result.details.method = 'dns_only';
      result.score += 5;
    }

    // Determine final status based on score and checks
    if (result.details.isCatchAll) {
      result.status = 'risky';
      result.reason = result.reason || 'Catch-all domain - cannot fully verify';
    } else if (result.details.isRoleBased) {
      if (result.score >= 70) {
        result.status = 'risky';
        result.reason = 'Role-based email address';
      } else {
        result.status = result.score >= 50 ? 'risky' : 'invalid';
      }
    } else if (result.score >= 80) {
      result.status = 'valid';
      result.reason = result.reason || 'Email verified successfully';
    } else if (result.score >= 50) {
      result.status = 'risky';
      result.reason = result.reason || 'Some verification checks inconclusive';
    } else {
      result.status = 'invalid';
      result.reason = result.reason || 'Failed verification checks';
    }

    return result;
  }

  // Bulk verification with progress tracking
  async verifyBulk(emails, onProgress, options = {}) {
    const { skipSmtpCheck = false, checkCatchAll = true } = options;
    const results = [];
    const total = emails.length;
    const domainCache = new Map(); // Cache MX lookups and catch-all results

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      
      try {
        // Extract domain for caching
        const domain = email.split('@')[1]?.toLowerCase();
        
        // Check cache for catch-all status
        let cachedCatchAll = null;
        if (domain && domainCache.has(domain)) {
          cachedCatchAll = domainCache.get(domain);
        }

        const result = await this.verifyEmail(email, { 
          skipSmtpCheck, 
          checkCatchAll: checkCatchAll && !cachedCatchAll 
        });
        
        // Cache catch-all result
        if (domain && result.details.isCatchAll !== undefined && !domainCache.has(domain)) {
          domainCache.set(domain, result.details.isCatchAll);
        }
        
        // Apply cached catch-all if we skipped the check
        if (cachedCatchAll !== null) {
          result.details.isCatchAll = cachedCatchAll;
          if (cachedCatchAll && result.status === 'valid') {
            result.status = 'risky';
            result.reason = 'Catch-all domain - cannot fully verify';
            result.score = Math.min(result.score, 65);
          }
        }

        results.push(result);
      } catch (error) {
        results.push({
          email,
          status: 'error',
          reason: error.message,
          score: 0,
          checks: {},
          details: { method: 'error' }
        });
      }

      if (onProgress) {
        onProgress({
          current: i + 1,
          total,
          email,
          status: results[results.length - 1].status
        });
      }

      // Small delay between verifications to avoid rate limiting
      if (!skipSmtpCheck) {
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    return {
      results,
      summary: {
        total,
        valid: results.filter(r => r.status === 'valid').length,
        risky: results.filter(r => r.status === 'risky').length,
        invalid: results.filter(r => r.status === 'invalid').length,
        error: results.filter(r => r.status === 'error').length
      }
    };
  }
}

module.exports = VerificationService;
