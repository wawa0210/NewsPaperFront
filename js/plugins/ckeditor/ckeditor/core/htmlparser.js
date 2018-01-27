


CKEDITOR.htmlParser = function() {
	this._ = {
		htmlPartsRegex: /<(?:(?:\/([^>]+)>)|(?:!--([\S|\s]*?)-->)|(?:([^\/\s>]+)((?:\s+[\w\-:.]+(?:\s*=\s*?(?:(?:"[^"]*")|(?:'[^']*')|[^\s"'\/>]+))?)*)[\S\s]*?(\/?)>))/g
	};
};

( function() {
	var attribsRegex = /([\w\-:.]+)(?:(?:\s*=\s*(?:(?:"([^"]*)")|(?:'([^']*)')|([^\s>]+)))|(?=\s|$))/g,
		emptyAttribs = { checked: 1, compact: 1, declare: 1, defer: 1, disabled: 1, ismap: 1, multiple: 1, nohref: 1, noresize: 1, noshade: 1, nowrap: 1, readonly: 1, selected: 1 };

	CKEDITOR.htmlParser.prototype = {
		
		onTagOpen: function() {},

		
		onTagClose: function() {},

		
		onText: function() {},

		
		onCDATA: function() {},

		
		onComment: function() {},

		
		parse: function( html ) {
			var parts, tagName,
				nextIndex = 0,
				cdata; // The collected data inside a CDATA section.

			while ( ( parts = this._.htmlPartsRegex.exec( html ) ) ) {
				var tagIndex = parts.index;
				if ( tagIndex > nextIndex ) {
					var text = html.substring( nextIndex, tagIndex );

					if ( cdata )
						cdata.push( text );
					else
						this.onText( text );
				}

				nextIndex = this._.htmlPartsRegex.lastIndex;

				// "parts" is an array with the following items:
				//		0 : The entire match for opening/closing tags and comments.
				//		  : Group filled with the tag name for closing tags.
				//		2 : Group filled with the comment text.
				//		3 : Group filled with the tag name for opening tags.
				//		4 : Group filled with the attributes part of opening tags.

				// Closing tag
				if ( ( tagName = parts[ 1 ] ) ) {
					tagName = tagName.toLowerCase();

					if ( cdata && CKEDITOR.dtd.$cdata[ tagName ] ) {
						// Send the CDATA data.
						this.onCDATA( cdata.join( '' ) );
						cdata = null;
					}

					if ( !cdata ) {
						this.onTagClose( tagName );
						continue;
					}
				}

				// If CDATA is enabled, just save the raw match.
				if ( cdata ) {
					cdata.push( parts[ 0 ] );
					continue;
				}

				// Opening tag
				if ( ( tagName = parts[ 3 ] ) ) {
					tagName = tagName.toLowerCase();

					// There are some tag names that can break things, so let's
					// simply ignore them when parsing. (#5224)
					if ( /="/.test( tagName ) )
						continue;

					var attribs = {},
						attribMatch,
						attribsPart = parts[ 4 ],
						selfClosing = !!parts[ 5 ];

					if ( attribsPart ) {
						while ( ( attribMatch = attribsRegex.exec( attribsPart ) ) ) {
							var attName = attribMatch[ 1 ].toLowerCase(),
								attValue = attribMatch[ 2 ] || attribMatch[ 3 ] || attribMatch[ 4 ] || '';

							if ( !attValue && emptyAttribs[ attName ] )
								attribs[ attName ] = attName;
							else
								attribs[ attName ] = CKEDITOR.tools.htmlDecodeAttr( attValue );
						}
					}

					this.onTagOpen( tagName, attribs, selfClosing );

					// Open CDATA mode when finding the appropriate tags.
					if ( !cdata && CKEDITOR.dtd.$cdata[ tagName ] )
						cdata = [];

					continue;
				}

				// Comment
				if ( ( tagName = parts[ 2 ] ) )
					this.onComment( tagName );
			}

			if ( html.length > nextIndex )
				this.onText( html.substring( nextIndex, html.length ) );
		}
	};
} )();
