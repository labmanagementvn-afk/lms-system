import { scormLaunchPath } from './uploads.service';

describe('scormLaunchPath', () => {
  it('follows the first item to its resource', () => {
    const manifest = `
      <manifest>
        <organizations><organization><item identifier="i1" identifierref="r2"><title>Bài 1</title></item></organization></organizations>
        <resources>
          <resource identifier="r1" type="webcontent" adlcp:scormtype="asset" href="assets/style.css"/>
          <resource identifier="r2" type="webcontent" adlcp:scormtype="sco" href="index_lms.html?x=1"/>
        </resources>
      </manifest>`;
    expect(scormLaunchPath(manifest)).toBe('index_lms.html?x=1');
  });

  it('falls back to the first resource with an href', () => {
    expect(scormLaunchPath('<manifest><resources><resource identifier="a" href="story.html"/></resources></manifest>')).toBe('story.html');
  });

  it('returns null when nothing is launchable', () => {
    expect(scormLaunchPath('<manifest/>')).toBeNull();
  });
});
