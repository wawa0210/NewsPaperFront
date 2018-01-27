

( function() {
	
	CKEDITOR.lang = {
		
		languages: {
			af: 1, ar: 1, bg: 1, bn: 1, bs: 1, ca: 1, cs: 1, cy: 1, da: 1, de: 1, 'de-ch': 1, el: 1,
			'en-au': 1, 'en-ca': 1, 'en-gb': 1, en: 1, eo: 1, es: 1, et: 1, eu: 1, fa: 1, fi: 1, fo: 1,
			'fr-ca': 1, fr: 1, gl: 1, gu: 1, he: 1, hi: 1, hr: 1, hu: 1, id: 1, is: 1, it: 1, ja: 1, ka: 1,
			km: 1, ko: 1, ku: 1, lt: 1, lv: 1, mk: 1, mn: 1, ms: 1, nb: 1, nl: 1, no: 1, pl: 1, 'pt-br': 1,
			pt: 1, ro: 1, ru: 1, si: 1, sk: 1, sl: 1, sq: 1, 'sr-latn': 1, sr: 1, sv: 1, th: 1, tr: 1, tt: 1, ug: 1,
			uk: 1, vi: 1, 'zh-cn': 1, zh: 1
		},

		
		rtl: { ar: 1, fa: 1, he: 1, ku: 1, ug: 1 },

		
		load: function( languageCode, defaultLanguage, callback ) {
			// If no languageCode - fallback to browser or default.
			// If languageCode - fallback to no-localized version or default.
			if ( !languageCode || !CKEDITOR.lang.languages[ languageCode ] )
				languageCode = this.detect( defaultLanguage, languageCode );

			var that = this,
				loadedCallback = function() {
					that[ languageCode ].dir = that.rtl[ languageCode ] ? 'rtl' : 'ltr';
					callback( languageCode, that[ languageCode ] );
				};

			if ( !this[ languageCode ] )
				CKEDITOR.scriptLoader.load( CKEDITOR.getUrl( 'lang/' + languageCode + '.js' ), loadedCallback, this );
			else
				loadedCallback();
		},

		
		detect: function( defaultLanguage, probeLanguage ) {
			var languages = this.languages;
			probeLanguage = probeLanguage || navigator.userLanguage || navigator.language || defaultLanguage;

			var parts = probeLanguage.toLowerCase().match( /([a-z]+)(?:-([a-z]+))?/ ),
				lang = parts[ 1 ],
				locale = parts[ 2 ];

			if ( languages[ lang + '-' + locale ] )
				lang = lang + '-' + locale;
			else if ( !languages[ lang ] )
				lang = null;

			CKEDITOR.lang.detect = lang ?
			function() {
				return lang;
			} : function( defaultLanguage ) {
				return defaultLanguage;
			};

			return lang || defaultLanguage;
		}
	};

} )();
