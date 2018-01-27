
 // Handles image pasting in Firefox
CKEDITOR.plugins.add( 'imagepaste',
{
	init : function( editor )
	{

		// v 4.1 filters
		if (editor.addFeature)
		{
			editor.addFeature( {
				allowedContent: 'img[!src,id];'
			} );
		}

		// Paste from clipboard:
		editor.on( 'paste', function(e) {
			var data = e.data,
				html = (data.html || ( data.type && data.type=='html' && data.dataValue));
			if (!html)
				return;

			// strip out webkit-fake-url as they are useless:
			if (CKEDITOR.env.webkit && (html.indexOf("webkit-fake-url")>0) )
			{
				alert("Sorry, the images pasted with Safari aren't usable");
				window.open("https://bugs.webkit.org/show_bug.cgi?id=49141");
				html = html.replace( /<img src="webkit-fake-url:.*?">/g, "");
			}

			// Replace data: images in Firefox and upload them
			html = html.replace( /<img src="data:image\/png;base64,.*?" alt="">/g, function( img )
				{
					var data = img.match(/"data:image\/png;base64,(.*?)"/)[1];
					var id = CKEDITOR.tools.getNextId();

					var url= editor.config.filebrowserImageUploadUrl;
					if (url.indexOf("?") == -1)
						url += "?";
					else
						url += "&";
					url += 'CKEditor=' + editor.name + '&CKEditorFuncNum=2&langCode=' + editor.langCode;
					// send tu qiniu.com
					if ( saveto='qiniu' ) {
						url=qiniu_upload_domain;
					}

					var xhr = new XMLHttpRequest();

					xhr.open("POST", url);
					xhr.onload = function() {
						// Upon finish, get the url and update the file
						var imageUrl = xhr.responseText.match(/2,\s*'(.*?)',/)[1];
						var theImage = editor.document.getById( id );
						theImage.data( 'cke-saved-src', imageUrl);
						theImage.setAttribute( 'src', imageUrl);
						theImage.removeAttribute( 'id' );
					}

					// Create the multipart data upload. Is it possible somehow to use FormData instead?
					var BOUNDARY = "---------------------------1966284435497298061834782736";
					var rn = "\r\n";
					var req = "--" + BOUNDARY;
					
					if ( saveto='qiniu' ) {
						req += rn + "Content-Disposition: form-data; name=\"file\"";

						var bin = window.atob( data );
						// add timestamp?
						req += "; filename=\"" + Math.round(new Date().getTime() / 1000) + "_" + id + ".png\"" + rn + "Content-type: image/png";
						
						req += rn + rn + bin + rn + "--" + BOUNDARY;
						
						req += rn +"Content-Disposition: form-data; name=\"token\"" + rn + rn + qiniu_uptoken;

						req += rn + rn + bin + rn + "--" + BOUNDARY;

					req += "--";
					} else {
						req += rn + "Content-Disposition: form-data; name=\"upload\"";

						var bin = window.atob( data );
						// add timestamp?
						req += "; filename=\"" + id + ".png\"" + rn + "Content-type: image/png";

						req += rn + rn + bin + rn + "--" + BOUNDARY;

					req += "--";
					}

					xhr.setRequestHeader("Content-Type", "multipart/form-data; boundary=" + BOUNDARY);
					xhr.sendAsBinary(req);

					return img.replace(/>/, ' id="' + id + '">')

				});

			if (e.data.html)
				e.data.html = html;
			else
				e.data.dataValue = html;
		});

	} //Init
} );
