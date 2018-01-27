




CKEDITOR.dom.text = function( text, ownerDocument ) {
	if ( typeof text == 'string' )
		text = ( ownerDocument ? ownerDocument.$ : document ).createTextNode( text );

	// Theoretically, we should call the base constructor here
	// (not CKEDITOR.dom.node though). But, IE doesn't support expando
	// properties on text node, so the features provided by domObject will not
	// work for text nodes (which is not a big issue for us).
	//
	// CKEDITOR.dom.domObject.call( this, element );

	this.$ = text;
};

CKEDITOR.dom.text.prototype = new CKEDITOR.dom.node();

CKEDITOR.tools.extend( CKEDITOR.dom.text.prototype, {
	
	type: CKEDITOR.NODE_TEXT,

	
	getLength: function() {
		return this.$.nodeValue.length;
	},

	
	getText: function() {
		return this.$.nodeValue;
	},

	
	setText: function( text ) {
		this.$.nodeValue = text;
	},

	
	split: function( offset ) {

		// Saved the children count and text length beforehand.
		var parent = this.$.parentNode,
			count = parent.childNodes.length,
			length = this.getLength();

		var doc = this.getDocument();
		var retval = new CKEDITOR.dom.text( this.$.splitText( offset ), doc );

		if ( parent.childNodes.length == count ) {
			// If the offset is after the last char, IE creates the text node
			// on split, but don't include it into the DOM. So, we have to do
			// that manually here.
			if ( offset >= length ) {
				retval = doc.createText( '' );
				retval.insertAfter( this );
			} else {
				// IE BUG: IE8+ does not update the childNodes array in DOM after splitText(),
				// we need to make some DOM changes to make it update. (#3436)
				var workaround = doc.createText( '' );
				workaround.insertAfter( retval );
				workaround.remove();
			}
		}

		return retval;
	},

	
	substring: function( indexA, indexB ) {
		// We need the following check due to a Firefox bug
		// https://bugzilla.mozilla.org/show_bug.cgi?id=458886
		if ( typeof indexB != 'number' )
			return this.$.nodeValue.substr( indexA );
		else
			return this.$.nodeValue.substring( indexA, indexB );
	}
} );
